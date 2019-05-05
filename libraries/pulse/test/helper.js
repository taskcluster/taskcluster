const {Secrets} = require('taskcluster-lib-testing');
const {defaultMonitorManager} = require('taskcluster-lib-monitor');

defaultMonitorManager.configure({
  serviceName: 'lib-pulse',
});

exports.monitor = defaultMonitorManager.setup({
  fake: true,
  debug: true,
  validate: true,
});

exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-lib-pulse',
  secrets: {
    pulse: [
      {env: 'PULSE_CONNECTION_STRING', name: 'connectionString'},
    ],
  },
});
