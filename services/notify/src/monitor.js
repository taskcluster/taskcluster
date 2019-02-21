const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'notify',
});

manager.register({
  name: 'email',
  type: 'email',
  version: 1,
  level: 'info',
  description: 'A request to send an email.',
  fields: {
    address: 'The requested recepient of the email.',
  },
});

manager.register({
  name: 'pulse',
  type: 'pulse',
  version: 1,
  level: 'info',
  description: 'A request to send a pulse message.',
  fields: {
    routingKey: 'The requested routingKey of the message.',
  },
});

manager.register({
  name: 'irc',
  type: 'irc',
  version: 1,
  level: 'info',
  description: 'A request to send an irc message.',
  fields: {
    destination: 'A user or channel. Will begin with "#" if a channel.',
  },
});

module.exports = manager;
