const {Secrets, withMonitor} = require('taskcluster-lib-testing');
const {defaultMonitorManager} = require('taskcluster-lib-monitor');

withMonitor(exports, {noLoader: true});

defaultMonitorManager.configure({
  serviceName: 'lib-pulse',
});

exports.monitor = defaultMonitorManager.setup({
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
