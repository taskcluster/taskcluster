const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const { ensureTask } = require('../../utils');

module.exports = ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  // Clean the artifacts directory and return it
  ensureTask(tasks, {
    title: 'Clean release-artifacts',
    requires: [],
    provides: ['clean-artifacts-dir'],
    run: async (requirements, utils) => {
      await rimraf(artifactsDir);
      await mkdirp(artifactsDir);
      return { 'clean-artifacts-dir': artifactsDir };
    },
  });

  ensureTask(tasks, {
    title: 'Get docker-flow version',
    requires: ['release-version', 'release-revision'],
    provides: ['docker-flow-version'],
    run: async (requirements, utils) => {
      if (requirements['release-version'].startsWith('v')) {
        throw new Error('release-version must not start with `v`');
      }

      utils.status({
        message: `calculating docker-flow data from version ${requirements['release-version']}, revision ${requirements['release-revision']}`,
      });

      return {
        'docker-flow-version': JSON.stringify({
          version: requirements['release-version'],
          commit: requirements['release-revision'],
          source: 'https://github.com/taskcluster/taskcluster',
          // https://github.com/mozilla-services/Dockerflow/blob/master/docs/version_object.md specifies a "build" link
          // pointing to a "CI Job".  Reference for what that means is basically
          // https://github.com/mozilla-services/cloudops-infra-deploylib/blob/1bf6de7f5270ec9f3482cd0a70915532e05d5fe7/deploylib/docker.py#L179-L204
          // so this tries to reverse-engineer that code to get it to find a file with a matching value
          build: process.env.TASK_ID ?
            `${process.env.TASKCLUSTER_ROOT_URL}/tasks/${process.env.TASK_ID}` :
            'NONE',
        }, null, 2),
      };
    },
  });
};
