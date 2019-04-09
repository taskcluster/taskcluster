const {Secrets} = require('taskcluster-lib-testing');

exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-lib-pulse',
  secrets: {
    pulse: [
      {env: 'PULSE_CONNECTION_STRING', name: 'connectionString'},
    ],
  },
});
