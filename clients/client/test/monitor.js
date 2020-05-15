const {MonitorManager} = require('taskcluster-lib-monitor');

exports.monitor = MonitorManager.setup({
  serviceName: 'client',
  fake: true,
  debug: true,
  verify: true,
});

exports.monitorManager = exports.monitor.manager;
