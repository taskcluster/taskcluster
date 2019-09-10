const semver = require('semver');
const Octokit = require('@octokit/rest');
const fs = require('fs');
const {ChangeLog} = require('../changelog');
const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {
  ensureTask,
  gitLsFiles,
  gitIsDirty,
  gitCommit,
  gitTag,
  gitPush,
  execCommand,
  readRepoJSON,
  readRepoFile,
  writeRepoFile,
  modifyRepoJSON,
  writeRepoYAML,
  modifyRepoFile,
  removeRepoFile,
  REPO_ROOT,
} = require('../utils');

const readFile = util.promisify(fs.readFile);

module.exports = ({tasks, cmdOptions, baseDir}) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  ensureTask(tasks, {
    title: 'Get Changelog',
    requires: [
      'repo-clean',
    ],
    provides: [
      'changelog',
    ],
    run: async (requirements, utils) => {
      const changelog = new ChangeLog();
      await changelog.load();
      return {changelog};
    },
  });

  ensureTask(tasks, {
    title: 'Calculate Next Version',
    requires: [
      'changelog',
    ],
    provides: [
      'release-version',
    ],
    run: async (requirements, utils) => {
      const pkgJson = await readRepoJSON('package.json');
      if (!semver.valid(pkgJson.version)) {
        throw new Error(`Version ${pkgJson.version} in package.json is not valid`);
      }

      const level = requirements['changelog'].level();

      return {
        'release-version': semver.inc(pkgJson.version, level),
      };
    },
  });

  ensureTask(tasks, {
    title: 'Check Repo is Clean',
    requires: [],
    provides: [
      'repo-clean',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      if (await gitIsDirty({dir: REPO_ROOT})) {
        throw new Error([
          'The current git working copy is not clean.  Releases can only be made from a clean',
          'working copy.',
        ].join(' '));
      }
    },
  });

  ensureTask(tasks, {
    title: 'Update Version in Repo',
    requires: [
      'release-version',
      'repo-clean',
    ],
    provides: [
      'version-updated',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      const changed = [];

      for (let file of await gitLsFiles({patterns: ['**/package.json', 'package.json']})) {
        utils.status({message: `Update ${file}`});
        await modifyRepoJSON(file, contents => {
          contents.version = requirements['release-version'];
        });
        changed.push(file);
      }

      const releaseImage = `taskcluster/taskcluster:v${requirements['release-version']}`;

      const build = 'infrastructure/tooling/current-release.yml';
      utils.status({message: `Update ${build}`});
      await writeRepoYAML(build, {image: releaseImage});
      changed.push(build);

      const valuesYaml = 'infrastructure/k8s/values.yaml';
      utils.status({message: `Update ${valuesYaml}`});
      await modifyRepoFile(valuesYaml, contents =>
        contents.replace(/dockerImage: .*/, `dockerImage: '${releaseImage}'`));
      changed.push(valuesYaml);

      const helmchart = 'infrastructure/k8s/Chart.yaml';
      utils.status({message: `Update ${helmchart}`});
      await modifyRepoFile(helmchart, contents =>
        contents.replace(/appVersion: .*/, `appVersion: '${requirements['release-version']}'`));
      changed.push(helmchart);

      const pyclient = 'clients/client-py/setup.py';
      utils.status({message: `Update ${pyclient}`});
      await modifyRepoFile(pyclient, contents =>
        contents.replace(/VERSION = .*/, `VERSION = '${requirements['release-version']}'`));
      changed.push(pyclient);

      const shellclient = 'clients/client-shell/cmds/version/version.go';
      utils.status({message: `Update ${shellclient}`});
      await modifyRepoFile(shellclient, contents =>
        contents.replace(/VersionNumber = .*/, `VersionNumber = "${requirements['release-version']}"`));
      changed.push(shellclient);

      const shellreadme = 'clients/client-shell/README.mdx';
      utils.status({message: `Update ${shellreadme}`});
      await modifyRepoFile(shellreadme, contents =>
        contents.replace(/download\/v[0-9.]*\/taskcluster-/g, `download/v${requirements['release-version']}/taskcluster-`));
      changed.push(shellreadme);

      const shellgomod = 'clients/client-shell/go.mod';
      const major = requirements['release-version'].replace(/\..*/, '');
      utils.status({message: `Update ${shellgomod}`});
      await modifyRepoFile(shellgomod, contents =>
        contents.replace(/(\tgithub.com\/taskcluster\/taskcluster\/clients\/client-go\/v)\d+ +v.*/g, `$1${major} v${requirements['release-version']}`));
      changed.push(shellgomod);

      // the go client requires the major version number in its import path, so
      // just about every file needs to be edited.  This matches the full package
      // path to avoid false positives, but that might result in missed changes
      // where the full path is not used.
      for (let file of await gitLsFiles({patterns: ['clients/client-go/**', 'clients/client-shell/**']})) {
        await modifyRepoFile(file, contents =>
          contents.replace(/(github.com\/taskcluster\/taskcluster\/clients\/client-go\/v)\d+/g, `$1${major}`));
        changed.push(file);
      }

      return {'version-updated': changed};
    },
  });

  ensureTask(tasks, {
    title: 'Update Changelog',
    requires: [
      'changelog',
      'release-version',
    ],
    provides: [
      'changed-files',
    ],
    run: async (requirements, utils) => {
      const changed = [];

      const marker = '<!-- NEXT RELEASE HERE -->\n';
      const oldCL = await readRepoFile('CHANGELOG.mdx');

      const markerIdx = oldCL.indexOf(marker);
      const breakpoint = markerIdx + marker.length;
      if (markerIdx === -1) {
        throw new Error('CHANGELOG.mdx does not contain the appropriate marker');
      }

      await writeRepoFile('CHANGELOG.mdx',
        oldCL.slice(0, breakpoint) +
          `\n## v${requirements['release-version']}\n\n` +
          requirements['changelog'].format() +
          '\n' +
          oldCL.slice(breakpoint));
      changed.push('CHANGELOG.mdx');

      for (let filename of requirements['changelog'].filenames()) {
        await removeRepoFile(filename);
        changed.push(filename);
      }

      return {'changed-files': changed};
    },
  });

  ensureTask(tasks, {
    title: 'Commit Updates',
    requires: [
      'version-updated',
      'release-version',
      'changed-files',
    ],
    provides: [
      'updates-committed',
    ],
    run: async (requirements, utils) => {
      const files = []
        .concat(requirements['version-updated'])
        .concat(requirements['changed-files']);
      utils.status({message: `Commit changes`});
      await gitCommit({
        dir: REPO_ROOT,
        message: `v${requirements['release-version']}`,
        files,
        utils,
      });
    },
  });

  ensureTask(tasks, {
    title: 'Tag Repo',
    requires: [
      'updates-committed',
      'release-version',
    ],
    provides: [
      'build-can-start',
      'repo-tagged',
    ],
    run: async (requirements, utils) => {
      const tag = `v${requirements['release-version']}`;
      // go gets confused by raw tags for a module in a subdirectory, so we
      // make a tag just for go
      const goClientTag = `clients/client-go/${tag}`;
      await gitTag({
        dir: REPO_ROOT,
        rev: 'HEAD',
        tag,
        utils,
      });
      await gitTag({
        dir: REPO_ROOT,
        rev: 'HEAD',
        tag: goClientTag,
        utils,
      });

      return {
        'build-can-start': true,
        'repo-tagged': [tag, goClientTag],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Clean release-artifacts',
    requires: [],
    provides: ['cleaned-release-artifacts'],
    run: async (requirements, utils) => {
      await rimraf(artifactsDir);
      await mkdirp(artifactsDir);
    },
  });

  ensureTask(tasks, {
    title: 'Build client-shell artifacts',
    requires: [
      'cleaned-release-artifacts',
      'version-updated',
    ],
    provides: ['client-shell-artifacts'],
    run: async (requirements, utils) => {
      await execCommand({
        dir: artifactsDir,
        command: ['go', 'get', '-u', 'github.com/mitchellh/gox'],
        utils,
      });

      const osarch = 'linux/amd64 darwin/amd64';
      await execCommand({
        dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
        command: [
          'gox',
          `-osarch=${osarch}`,
          `-output=${artifactsDir}/taskcluster-{{.OS}}-{{.Arch}}`,
        ],
        utils,
      });

      const artifacts = osarch.split(' ')
        .map(osarch => {
          const [os, arch] = osarch.split('/');
          return `taskcluster-${os}-${arch}`;
        });

      return {
        'client-shell-artifacts': artifacts,
      };
    },
  });

  /* -- docker image build occurs here -- */

  ensureTask(tasks, {
    title: 'Push Tag',
    requires: [
      'release-version',
      'repo-tagged',
      'target-monoimage',
      'client-shell-artifacts',
      'monoimage-docker-image',
    ],
    provides: [
      'pushed-tag',
    ],
    run: async (requirements, utils) => {
      // the build process should have used the git tag to name the docker image..
      if (requirements['monoimage-docker-image'] !== `taskcluster/taskcluster:v${requirements['release-version']}`) {
        throw new Error('Got unexpected docker-image name');
      }

      if (!cmdOptions.push) {
        return utils.skip({});
      }

      const tags = requirements['repo-tagged'];
      await gitPush({
        dir: REPO_ROOT,
        remote: 'git@github.com:taskcluster/taskcluster',
        refs: [...tags, 'master'],
        utils,
      });

      return {
        'pushed-tag': tags[0],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Create GitHub Release',
    requires: [
      'release-version',
      'client-shell-artifacts',
      'pushed-tag',
      'changelog',
    ],
    provides: [
      'github-release',
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
      }

      const octokit = new Octokit({auth: `token ${cmdOptions.ghToken}`});

      utils.status({message: `Create Release`});
      const release = await octokit.repos.createRelease({
        owner: 'taskcluster',
        repo: 'taskcluster',
        tag_name: requirements['pushed-tag'],
        name: requirements['pushed-tag'],
        body: requirements['changelog'].format(),
        draft: false,
        prerelease: false,
      });
      const {upload_url} = release.data;

      const files = requirements['client-shell-artifacts']
        .map(name => ({name, contentType: 'application/octet-stream'}));
      for (let {name, contentType} of files) {
        utils.status({message: `Upload Release asset ${name}`});
        const file = await readFile(path.join(artifactsDir, name));
        await octokit.repos.uploadReleaseAsset({
          url: upload_url,
          headers: {
            'content-length': file.length,
            'content-type': contentType,
          },
          name,
          file,
        });
      }

      return {
        'github-release': release.data.html_url,
      };
    },
  });
};
