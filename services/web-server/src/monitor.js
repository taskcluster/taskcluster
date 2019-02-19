const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  serviceName: 'web-server',
});

module.exports = builder;
