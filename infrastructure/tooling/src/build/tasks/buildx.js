const path = require('path');
const {
  ensureTask,
  execCommand,
  REPO_ROOT,
} = require('../../utils');

const DOCKER_PLATFORMS = 'linux/arm64,linux/amd64';

module.exports = ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
  ensureTask(tasks, {
    title: 'Buildx docker container',
    requires: [],
    provides: ['buildx-container'],
    run: async (requirements, utils) => {

      const buildxCommand = [
        'docker',
        'buildx',
        'create',
        '--platform',
        DOCKER_PLATFORMS,
        '--use',
      ];

      await execCommand({
        command: buildxCommand,
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'buildx-create-container.log'),
        utils,
        env: { DOCKER_BUILDKIT: 1, ...process.env },
      });

      return {
        'buildx-container': DOCKER_PLATFORMS,
      };
    },
  });
};
