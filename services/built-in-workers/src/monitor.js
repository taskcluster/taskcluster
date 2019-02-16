const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-built-in-workers',
});

module.exports = builder;
