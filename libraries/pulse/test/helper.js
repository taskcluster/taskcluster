const {Secrets, withMonitor} = require('taskcluster-lib-testing');
const {MonitorManager} = require('taskcluster-lib-monitor');

withMonitor(exports, {noLoader: true});

exports.monitor = MonitorManager.setup({
  serviceName: 'lib-pulse',
  fake: true,
  debug: true,
  validate: true,
});

exports.secrets = new Secrets({
  secretName: [],
  secrets: {
    pulse: [
      {env: 'PULSE_CONNECTION_STRING', name: 'connectionString'},
    ],
  },
});
