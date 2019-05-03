const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'web-server',
});

manager.register({
  name: 'createCredentials',
  title: 'Credentials Created',
  type: 'create-credentials',
  version: 1,
  level: 'info',
  description: 'A user has been issued Taskcluster credentials',
  fields: {
    credentials: 'Taskcluster credentials.',
    expires: 'Date time when the credentials expires.',
  },
});

module.exports = manager;
