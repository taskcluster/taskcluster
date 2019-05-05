const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'purge-cache',
});

module.exports = monitorManager;
