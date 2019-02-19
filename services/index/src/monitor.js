const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  serviceName: 'index',
});

module.exports = builder;
