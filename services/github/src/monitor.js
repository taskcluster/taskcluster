const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  serviceName: 'github',
});

module.exports = builder;
