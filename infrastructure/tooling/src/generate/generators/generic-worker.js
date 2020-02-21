const path = require('path');
const {REPO_ROOT, execCommand} = require('../../utils');

exports.tasks = [{
  title: 'Generate Generic-Worker',
  requires: ['references-json', 'target-go-version'],
  provides: ['target-generic-worker'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'workers', 'generic-worker'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}];
