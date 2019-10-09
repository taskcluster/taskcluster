const path = require('path');
const {REPO_ROOT, execCommand} = require('../../utils');

exports.tasks = [{
  title: 'Generate Taskcluster-Client-Shell',
  requires: ['references-json', 'go-version'],
  provides: ['generate-taskcluster-client-shell'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
      command: ['go', 'generate', './...'],
      utils,
    });
  },
}, {
  title: 'Run `go mod tidy` for Taskcluster-Client-Shell',
  requires: ['generate-taskcluster-client-shell'],
  provides: ['target-taskcluster-client-shell'],
  run: async (requirements, utils) => {
    await execCommand({
      dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
      command: ['go', 'mod', 'tidy'],
      utils,
    });
  },
}];
