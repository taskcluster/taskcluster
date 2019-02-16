const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-index',
});

module.exports = builder;
