const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-secrets', // TODO: Consider changing all of these to serviceName
});

module.exports = builder;
