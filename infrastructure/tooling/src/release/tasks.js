const semver = require('semver');
const path = require('path');
const { ChangeLog } = require('../changelog');
const {
  ensureTask,
  gitLsFiles,
  gitRemoteRev,
  gitDescribe,
  gitIsDirty,
  gitCommit,
  gitTag,
  gitPush,
  getDbReleases,
  updateDbFns,
  updateVersionsReadme,
  readRepoJSON,
  readRepoFile,
  writeRepoFile,
  modifyRepoJSON,
  writeRepoYAML,
  modifyRepoFile,
  removeRepoFile,
  REPO_ROOT,
} = require('../utils');
const { schema: readSchema } = require('taskcluster-db');

const UPSTREAM_REMOTE = 'git@github.com:taskcluster/taskcluster';

module.exports = ({ tasks, cmdOptions, credentials }) => {
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
      return { changelog };
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
      if (await gitIsDirty({ dir: REPO_ROOT })) {
        throw new Error([
          'The current git working copy is not clean.  Releases can only be made from a clean',
          'working copy.',
        ].join(' '));
      }
    },
  });

  ensureTask(tasks, {
    title: 'Check Repo is Up To Date with Upstream main',
    requires: [],
    provides: [
      'repo-up-to-date',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      const { revision: localRevision } = await gitDescribe({ dir: REPO_ROOT, utils });
      const { revision: remoteRevision } = await gitRemoteRev({
        dir: REPO_ROOT,
        remote: UPSTREAM_REMOTE,
        ref: 'main',
        utils,
      });
      if (localRevision !== remoteRevision) {
        throw new Error([
          `The current git working copy (${localRevision}) is not up to date with the upstream ` +
          `repo (${remoteRevision}). Pull the latest changes and try again.`,
        ].join(' '));
      }
    },
  });

  ensureTask(tasks, {
    title: 'Update Version in Repo',
    requires: [
      'release-version',
      'repo-clean',
      'repo-up-to-date',
    ],
    provides: [
      'version-updated',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      const changed = [];

      for (let file of await gitLsFiles({ patterns: ['**/package.json', 'package.json'] })) {
        utils.status({ message: `Update ${file}` });
        await modifyRepoJSON(file, contents => {
          contents.version = requirements['release-version'];
        });
        changed.push(file);
      }

      const releaseImage = `taskcluster/taskcluster:v${requirements['release-version']}`;

      const build = 'infrastructure/tooling/current-release.yml';
      utils.status({ message: `Update ${build}` });
      await writeRepoYAML(build, { image: releaseImage });
      changed.push(build);

      const valuesYaml = 'infrastructure/k8s/values.yaml';
      utils.status({ message: `Update ${valuesYaml}` });
      await modifyRepoFile(valuesYaml, contents =>
        contents.replace(/dockerImage: .*/, `dockerImage: ${releaseImage}`));
      changed.push(valuesYaml);

      const helmchart = 'infrastructure/k8s/Chart.yaml';
      utils.status({ message: `Update ${helmchart}` });
      await modifyRepoFile(helmchart, contents =>
        contents.replace(/appVersion: .*/, `appVersion: '${requirements['release-version']}'`));
      changed.push(helmchart);

      const pyclient = 'clients/client-py/setup.py';
      utils.status({ message: `Update ${pyclient}` });
      await modifyRepoFile(pyclient, contents =>
        contents.replace(/VERSION = .*/, `VERSION = '${requirements['release-version']}'`));
      changed.push(pyclient);

      for (const dir of ['client', 'upload', 'download', 'integration_tests']) {
        const rsclient = `clients/client-rust/${dir}/Cargo.toml`;
        utils.status({ message: `Update ${rsclient}` });
        await modifyRepoFile(rsclient, contents =>
          contents
            .replace(/^version = ".*"$/m, `version = "${requirements['release-version']}"`)
            .replace(/^taskcluster = .*$/m, `taskcluster = { version = "${requirements['release-version']}", path = "../client" }`));
        changed.push(rsclient);
      }

      const rslock = `clients/client-rust/Cargo.lock`;
      utils.status({ message: `Update ${rslock}` });
      await modifyRepoFile(rslock, contents =>
        contents.replace(
          /^(name = "taskcluster[a-z-]*"\n)version = ".*"$/mg,
          `$1version = "${requirements['release-version']}"`));
      changed.push(rslock);

      const shellclient = 'clients/client-shell/cmds/version/version.go';
      utils.status({ message: `Update ${shellclient}` });
      await modifyRepoFile(shellclient, contents =>
        contents.replace(/VersionNumber = .*/, `VersionNumber = "${requirements['release-version']}"`));
      changed.push(shellclient);

      const shellreadme = 'clients/client-shell/README.md';
      utils.status({ message: `Update ${shellreadme}` });
      await modifyRepoFile(shellreadme, contents =>
        contents.replace(/download\/v[0-9.]*\/taskcluster-/g, `download/v${requirements['release-version']}/taskcluster-`));
      changed.push(shellreadme);

      const internalVersion = 'internal/version.go';
      utils.status({ message: `Update ${internalVersion}` });
      await modifyRepoFile(internalVersion, contents =>
        contents.replace(/^(\s*Version\s*=\s*).*/m, `$1"${requirements['release-version']}"`));
      changed.push(internalVersion);

      // The go libraries require the major version number in their package
      // import paths, so just about every file needs to be edited. This
      // matches the full package path to avoid false positives, but that
      // might result in missed changes where the full path is not used.
      const major = requirements['release-version'].replace(/\..*/, '');
      // Note, this intentionally also includes scripts and yaml files that
      // also refer to the release version.
      const goFiles = [
        'go.mod',
        'clients/client-go/**',
        'clients/client-shell/**',
        'internal/**',
        'tools/**',
        'ui/docs/reference/workers/websocktunnel.mdx',
        // Provide explicit list of allowed file extensions so that
        // workers/generic-worker/testdata/*.zip files are not modified.
        'workers/generic-worker/**.go',
        'workers/generic-worker/**.yml',
        'workers/generic-worker/**.sh',
        'workers/generic-worker/**.cmd',
      ];
      for (let file of await gitLsFiles({ patterns: goFiles })) {
        await modifyRepoFile(file, contents =>
          contents.replace(/(github.com\/taskcluster\/taskcluster\/v)\d+/g, `$1${major}`));
        changed.push(file);
      }

      utils.status({ message: 'Dockerfile' });
      await modifyRepoFile('Dockerfile',
        contents => contents.replace(
          /\\"version\\":\s*\\"([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2})/gm,
          `\\"version\\": \\"${requirements['release-version']}`));
      changed.push('Dockerfile');

      return { 'version-updated': changed };
    },
  });

  ensureTask(tasks, {
    title: 'Update DB Release Mapping',
    requires: [
      'release-version',
      'repo-clean',
      'repo-up-to-date',
    ],
    provides: [
      'db-releases',
      'db-releases-txt',
    ],
    run: async (requirements, utils) => {
      const schema = await readSchema();
      const tcVersion = `v${requirements['release-version']}`;
      const dbVersion = schema.latestVersion().version;
      const releasesFile = path.join('db', 'releases.txt');

      // append this TC release version and DB version to the list of releases
      await modifyRepoFile(releasesFile,
        content => content.trim() + `\n${tcVersion}: ${dbVersion}\n`);

      return {
        // load the whole txt file into `db-releases`
        'db-releases': await getDbReleases(),
        'db-releases-txt': [releasesFile],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Update DB Version README',
    requires: [
      'release-version',
      'repo-clean',
      'repo-up-to-date',
      'db-releases',
    ],
    provides: [
      'db-version-updated',
    ],
    run: async (requirements, utils) => {
      const schema = await readSchema();

      // then, regenerate the versions reference
      const releases = requirements['db-releases'];
      const versionsReadme = await updateVersionsReadme(schema, releases);

      return {
        'db-version-updated': [versionsReadme],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Update DB Functions with new version',
    requires: [
      'release-version',
      'repo-clean',
      'repo-up-to-date',
      'db-releases',
    ],
    provides: [
      'db-fns-updated',
    ],
    run: async (requirements, utils) => {
      const schema = await readSchema();

      // then, regenerate the versions reference
      const releases = requirements['db-releases'];
      const tcVersion = requirements['release-version'];
      const dbFnsFile = await updateDbFns(schema, releases, tcVersion);

      return {
        'db-fns-updated': [dbFnsFile],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Update Changelog',
    requires: [
      'changelog',
      'release-version',
      'repo-clean',
      'repo-up-to-date',
    ],
    provides: [
      'changed-files',
    ],
    run: async (requirements, utils) => {
      const changed = [];

      const marker = '<!-- NEXT RELEASE HERE -->\n';
      const oldCL = await readRepoFile('CHANGELOG.md');

      const markerIdx = oldCL.indexOf(marker);
      const breakpoint = markerIdx + marker.length;
      if (markerIdx === -1) {
        throw new Error('CHANGELOG.md does not contain the appropriate marker');
      }

      await writeRepoFile('CHANGELOG.md',
        oldCL.slice(0, breakpoint) +
          `\n## v${requirements['release-version']}\n\n` +
          (await requirements['changelog'].format()) +
          '\n' +
          oldCL.slice(breakpoint));
      changed.push('CHANGELOG.md');

      for (let filename of requirements['changelog'].filenames()) {
        await removeRepoFile(filename);
        changed.push(filename);
      }

      return { 'changed-files': changed };
    },
  });

  ensureTask(tasks, {
    title: 'Commit Updates',
    requires: [
      'db-releases-txt',
      'db-version-updated',
      'db-fns-updated',
      'version-updated',
      'release-version',
      'changed-files',
    ],
    provides: [
      'updates-committed',
    ],
    run: async (requirements, utils) => {
      const files = []
        .concat(requirements['db-releases-txt'])
        .concat(requirements['db-version-updated'])
        .concat(requirements['db-fns-updated'])
        .concat(requirements['version-updated'])
        .concat(requirements['changed-files']);
      utils.status({ message: `Commit changes` });
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
      await gitTag({
        dir: REPO_ROOT,
        rev: 'HEAD',
        tag,
        utils,
      });

      return {
        'build-can-start': true,
        'repo-tagged': [tag],
      };
    },
  });

  ensureTask(tasks, {
    title: 'Push Tag',
    requires: [
      'repo-tagged',
    ],
    provides: [
      'target-release',
    ],
    run: async (requirements, utils) => {
      if (!cmdOptions.push) {
        return utils.skip({});
      }

      const tags = requirements['repo-tagged'];
      await gitPush({
        dir: REPO_ROOT,
        remote: 'git@github.com:taskcluster/taskcluster',
        refs: [...tags, 'main'],
        utils,
      });
    },
  });

  ensureTask(tasks, {
    title: 'Push Staging Release',
    requires: [
      'release-version',
    ],
    provides: [
      'target-staging-release',
    ],
    run: async (requirements, utils) => {
      const version = requirements['release-version'];
      await gitPush({
        dir: REPO_ROOT,
        remote: 'git@github.com:taskcluster/staging-releases',
        refs: [`HEAD:staging-release/v${version}`],
        force: true,
        utils,
      });

      return {
        'target-staging-release': `https://github.com/taskcluster/staging-releases/tree/staging-release/v${version}`,
      };
    },
  });
};
