const semver = require('semver');
const {ChangeLog} = require('../changelog');
const {
  ensureTask,
  gitLsFiles,
  gitIsDirty,
  gitCommit,
  gitTag,
  gitPush,
  readRepoJSON,
  readRepoFile,
  writeRepoFile,
  modifyRepoJSON,
  modifyRepoFile,
  removeRepoFile,
  REPO_ROOT,
} = require('../utils');

module.exports = ({tasks, cmdOptions}) => {
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

      const tctf = 'infrastructure/terraform/taskcluster.tf.json';
      utils.status({message: `Update ${tctf}`});
      await modifyRepoJSON(tctf, contents => {
        contents.locals.taskcluster_image_monoimage = `taskcluster/taskcluster:v${requirements['release-version']}`;
      });
      changed.push(tctf);

      const pyclient = 'clients/client-py/setup.py';
      utils.status({message: `Update ${pyclient}`});
      await modifyRepoFile(pyclient, contents =>
        contents.replace(/VERSION = .*/, `VERSION = '${requirements['release-version']}'`));
      changed.push(pyclient);

      // the go client requires the major version number in its import path, so
      // just about every file needs to be edited.  This matches the full package
      // path to avoid false positives, but that might result in missed changes
      // where the full path is not used.
      const major = requirements['release-version'].replace(/\..*/, '');
      for (let file of await gitLsFiles({patterns: ['clients/client-go/**']})) {
        await modifyRepoFile(file, contents =>
          contents.replace(/(github.com\/taskcluster\/taskcluster\/clients\/client-go\/v)\d+/g, `$1${major}`));
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
      const oldCL = await readRepoFile('CHANGELOG.md');

      const markerIdx = oldCL.indexOf(marker);
      const breakpoint = markerIdx + marker.length;
      if (markerIdx === -1) {
        throw new Error('CHANGELOG.md does not contain the appropriate marker');
      }

      await writeRepoFile('CHANGELOG.md',
        oldCL.slice(0, breakpoint) +
          `\n## v${requirements['release-version']}\n\n` +
          requirements['changelog'].format() +
          '\n' +
          oldCL.slice(breakpoint));
      changed.push('CHANGELOG.md');

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
    ],
    run: async (requirements, utils) => {
      await gitTag({
        dir: REPO_ROOT,
        rev: 'HEAD',
        tag: `v${requirements['release-version']}`,
        utils,
      });
    },
  });

  /* -- build occurs here -- */

  ensureTask(tasks, {
    title: 'Push Tag',
    requires: [
      'release-version',
      'target-monoimage',
      'monoimage-docker-image',
    ],
    provides: [],
    run: async (requirements, utils) => {
      // the build process should have used the git tag to name the docker image..
      if (requirements['monoimage-docker-image'] !== `taskcluster/taskcluster:v${requirements['release-version']}`) {
        throw new Error('Got unexpected docker-image name');
      }

      if (!cmdOptions.push) {
        return utils.skip({});
      }

      await gitPush({
        dir: REPO_ROOT,
        remote: 'git@github.com:taskcluster/taskcluster',
        ref: `v${requirements['release-version']}`,
        utils,
      });
    },
  });

};
