const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-hooks',
});

module.exports = builder;
