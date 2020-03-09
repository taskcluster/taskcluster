const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'notify',
});

monitorManager.register({
  name: 'email',
  title: 'Email Sent',
  type: 'email',
  version: 1,
  level: 'info',
  description: 'Email has been sent.',
  fields: {
    address: 'The requested recepient of the email.',
  },
});

monitorManager.register({
  name: 'pulse',
  title: 'Pulse Event Published',
  type: 'pulse',
  version: 1,
  level: 'info',
  description: 'A pulse event has been published.',
  fields: {
    routingKey: 'The requested routingKey of the message.',
  },
});

monitorManager.register({
  name: 'irc',
  title: 'IRC Message Sent',
  type: 'irc',
  version: 1,
  level: 'info',
  description: 'An irc message has been sent.',
  fields: {
    dest: 'A user or channel. Will begin with "#" if a channel.',
  },
});

monitorManager.register({
  name: 'matrix',
  title: 'Matrix Message Sent',
  type: 'matrix',
  version: 1,
  level: 'info',
  description: 'A matrix message has been sent.',
  fields: {
    dest: 'A user or room.',
  },
});

monitorManager.register({
  name: 'matrixSdkDebug',
  title: 'Matrix SDK Debug',
  type: 'matrix-sdk-debug',
  version: 1,
  level: 'debug',
  description: 'Log events from the matrix sdk. Contains arbitrary data from them.',
  fields: {
    message: 'Arbitrary message from matrix sdk.',
    level: 'The level that matrix logged this at. We send all logs to debug no matter what.',
  },
});

monitorManager.register({
  name: 'matrixForbidden',
  title: 'Matrix Forbidden',
  type: 'matrix-forbidden',
  version: 1,
  level: 'notice',
  description: `We have been rejected from messaging a room. This is expected if the user
                has not invited our client into the room yet but we log it as a notice to
                help debug confused users.`,
  fields: {
    roomId: 'The roomId that we were forbidden from.',
  },
});

module.exports = monitorManager;
