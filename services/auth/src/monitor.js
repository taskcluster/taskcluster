const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  serviceName: 'auth',
});

module.exports = builder;
