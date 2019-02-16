const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-auth',
});

module.exports = builder;
