const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  serviceName: 'purge-cache',
});

module.exports = builder;
