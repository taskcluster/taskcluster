const semver = require('semver');

const {
  ensureTask,
  gitLsFiles,
  gitIsDirty,
  gitCommit,
  gitTag,
  gitPush,
  readRepoJSON,
  modifyRepoJSON,
  modifyRepoFile,
  REPO_ROOT,
} = require('../utils');

module.exports = ({tasks, version, cmdOptions}) => {
  ensureTask(tasks, {
    title: 'Check Version',
    requires: [],
    provides: [
      'version-checked',
    ],
    run: async (requirements, utils) => {
      if (!semver.valid(version)) {
        throw new Error(`Version ${version} is not a valid semver version`);
      }
      const pkgJson = await readRepoJSON('package.json');
      if (!semver.gt(version, pkgJson.version)) {
        throw new Error(`Version ${version} is not later than ${pkgJson.version} in package.json`);
      }
    },
  });

  ensureTask(tasks, {
    title: 'Update Version in Repo',
    requires: [
      'version-checked',
    ],
    provides: [
      'repo-modified',
    ],
    run: async (requirements, utils) => {
      if (await gitIsDirty({dir: REPO_ROOT})) {
        throw new Error([
          'The current git working copy is not clean.  Releases can only be made from a clean',
          'working copy.',
        ].join(' '));
      }

      const changed = [];

      for (let file of await gitLsFiles({patterns: ['**/package.json', 'package.json']})) {
        utils.status({message: `Update ${file}`});
        await modifyRepoJSON(file, contents => {
          contents.version = version;
        });
        changed.push(file);
      }

      const tctf = 'infrastructure/terraform/taskcluster.tf.json';
      utils.status({message: `Update ${tctf}`});
      await modifyRepoJSON(tctf, contents => {
        contents.locals.taskcluster_image_monoimage = `taskcluster/taskcluster:v${version}`;
      });
      changed.push(tctf);

      const pyclient = 'clients/client-py/setup.py';
      utils.status({message: `Update ${pyclient}`});
      await modifyRepoFile(pyclient, contents =>
        contents.replace(/VERSION = .*/, `VERSION = '${version}'`));
      changed.push(pyclient);

      utils.status({message: `Commit changes`});
      await gitCommit({
        dir: REPO_ROOT,
        message: `v${version}`,
        files: changed,
        utils,
      });
    },
  });

  ensureTask(tasks, {
    title: 'Tag Repo',
    requires: [
      'repo-modified',
    ],
    provides: [
      'build-can-start',
    ],
    run: async (requirements, utils) => {
      await gitTag({
        dir: REPO_ROOT,
        rev: 'HEAD',
        tag: `v${version}`,
        utils,
      });
    },
  });

  /* -- build occurs here -- */

  ensureTask(tasks, {
    title: 'Push Tag',
    requires: [
      'target-monoimage',
      'monoimage-docker-image',
    ],
    provides: [],
    run: async (requirements, utils) => {
      // the build process should have used the git tag to name the docker image..
      if (requirements['monoimage-docker-image'] !== `taskcluster/taskcluster:v${version}`) {
        throw new Error('Got unexpected docker-image name');
      }

      await gitPush({
        dir: REPO_ROOT,
        remote: 'git@github.com:taskcluster/taskcluster',
        ref: `v${version}`,
        utils,
      });
    },
  });

};
