const path = require('path');
const {REPO_ROOT, execCommand} = require('../../utils');

exports.tasks = [];

exports.tasks.push({
  title: 'Update worker-runner README file',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-worker-runner'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'tools', 'worker-runner'),
      command: ['go', 'run', path.join(REPO_ROOT, 'tools', 'worker-runner', 'cmd', 'update-readme')],
      utils,
    });
  },
});
