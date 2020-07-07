const glob = require('glob');
const path = require('path');
const {
  ensureTask,
  execCommand,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Build worker-runner artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['worker-runner-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];

      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'worker-runner'),
        command: ['./build.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('start-worker-*', {cwd: artifactsDir});

      return {
        'worker-runner-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Worker-Runner Complete',
    requires: [
      'clean-artifacts-dir',
      'worker-runner-artifacts',
    ],
    provides: [
      'target-worker-runner',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-worker-runner': [
          'Worker-Runner artifacts:',
          ...requirements['worker-runner-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
        ].join('\n'),
      };
    },
  });
};
