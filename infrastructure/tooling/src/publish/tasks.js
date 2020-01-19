const Octokit = require('@octokit/rest');
const fs = require('fs');
const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {
  ensureTask,
  gitDescribe,
  npmPublish,
  execCommand,
  pyClientRelease,
  readRepoFile,
  REPO_ROOT,
} = require('../utils');

const readFile = util.promisify(fs.readFile);

module.exports = ({tasks, cmdOptions, credentials, baseDir}) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  ensureTask(tasks, {
    title: 'Get release version',
    requires: [],
    provides: ['release-version'],
    run: async (requirements, utils) => {
      const {gitDescription} = await gitDescribe({
        dir: REPO_ROOT,
        utils,
      });

      if (!gitDescription.match(/^v\d+\.\d+\.\d+$/)) {
        throw new Error(`Can only publish releases from git revisions with tags of the form vX.Y.Z, not ${gitDescription}`);
      }

      return {
        'release-version': gitDescription.slice(1),
      };
    },
  });

  ensureTask(tasks, {
    title: 'Get ChangeLog',
    requires: ['release-version'],
    provides: [
      'changelog-text',
      'build-can-start', // wait to build until we're sure this worked..
    ],
    run: async (requirements, utils) => {
      // recover the changelog for this version from CHANGELOG.md, where `yarn
      // release` put it
      const changelogFile = await readRepoFile('CHANGELOG.md');
      const version = requirements['release-version'];
      const regex = new RegExp(`^## v${version}\n+(.*?)\n^## v`, 'sm');
      const match = changelogFile.match(regex);
      if (!match) {
        throw new Error(`Could not find version ${version} in CHANGELOG.md`);
      }
      return {
        'changelog-text': match[1],
        'build-can-start': true,
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
    requires: ['cleaned-release-artifacts'],
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
    title: 'Create GitHub Release',
    requires: [
      'release-version',
      'client-shell-artifacts',
      'changelog-text',
      'target-monoimage',
    ],
    provides: [
      'github-release',
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
      }

      const octokit = new Octokit({auth: `token ${credentials.ghToken}`});

      utils.status({message: `Create Release`});
      const release = await octokit.repos.createRelease({
        owner: 'taskcluster',
        repo: 'taskcluster',
        tag_name: `v${requirements['release-version']}`,
        name: `v${requirements['release-version']}`,
        body: await requirements['changelog-text'],
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

  ['clients/client', 'clients/client-web'].forEach(clientName =>
    ensureTask(tasks, {
      title: `Publish ${clientName} to npm`,
      requires: [
        'target-monoimage', // to make sure the build succeeds first..
      ],
      provides: [
        `publish-${clientName}`,
      ],
      run: async (requirements, utils) => {
        if (!cmdOptions.push) {
          return utils.skip({});
        }

        await npmPublish({
          dir: path.join(REPO_ROOT, clientName),
          apiToken: credentials.npmToken,
          logfile: `${baseDir}/publish-${clientName.replace('/', '-')}.log`,
          utils});
      },
    }));

  ensureTask(tasks, {
    title: `Publish clients/client-py to pypi`,
    requires: [
      'target-monoimage', // to make sure the build succeeds first..
    ],
    provides: [
      `publish-clients/client-py`,
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
      }

      await pyClientRelease({
        dir: path.join(REPO_ROOT, 'clients', 'client-py'),
        username: credentials.pypiUsername,
        password: credentials.pypiPassword,
        logfile: `${baseDir}/publish-client-py.log`,
        utils});
    },
  });

  ensureTask(tasks, {
    title: 'Publish Complete',
    requires: [
      'target-monoimage',
      'github-release',
      'publish-clients/client',
      'publish-clients/client-web',
      'publish-clients/client-py',
    ],
    provides: [
      'target-publish',
    ],
    run: async (requirements, utils) => {
      // this just gathers requirements into a single target..
    },
  });
};
