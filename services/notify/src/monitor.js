const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'notify',
});

manager.register({
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

manager.register({
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

manager.register({
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

module.exports = manager;
