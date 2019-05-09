const {defaultMonitorManager} = require('taskcluster-lib-monitor');

exports.monitorManager = defaultMonitorManager.configure({
  serviceName: 'client',
});

exports.monitor = exports.monitorManager.setup({
  fake: true,
  debug: true,
  verify: true,
});
