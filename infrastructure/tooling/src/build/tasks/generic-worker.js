const glob = require('glob');
const path = require('path');
const {
  ensureTask,
  execCommand,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
  ensureTask(tasks, {
    title: 'Build generic-worker artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['generic-worker-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];

      await execCommand({
        dir: path.join(REPO_ROOT, 'workers', 'generic-worker'),
        command: ['./build.sh', '-p', '-o', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('generic-worker-*', { cwd: artifactsDir });

      return {
        'generic-worker-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Generic-Worker Complete',
    requires: [
      'clean-artifacts-dir',
      'generic-worker-artifacts',
    ],
    provides: [
      'target-generic-worker',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-generic-worker': [
          'Generic-Worker artifacts:',
          ...requirements['generic-worker-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
        ].join('\n'),
      };
    },
  });
};
