const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'web-server',
});

monitorManager.register({
  name: 'createCredentials',
  title: 'Credentials Created',
  type: 'create-credentials',
  version: 1,
  level: 'info',
  description: 'A client has been issued Taskcluster credentials',
  fields: {
    clientId: 'The clientId of the issued credentials',
    userIdentity: 'The identity of the user to which the credentials were issued',
    expires: 'Date time when the issued credentials expires.',
  },
});

module.exports = monitorManager;
