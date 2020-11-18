const { defaultMonitorManager } = require('../../src/monitor');

module.exports = defaultMonitorManager.configure({
  serviceName: 'docker-worker-tests',
}).setup({
  processName: 'docker-worker',
  fake: true,
});
