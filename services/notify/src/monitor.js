const MonitorBuilder = require('taskcluster-lib-monitor');

const builder = new MonitorBuilder({
  projectName: 'taskcluster-notify',
});

builder.register({
  name: 'email',
  type: 'email',
  version: 1,
  level: 'info',
  description: 'A request to send an email.',
  fields: {
    address: 'The requested recepient of the email.',
  },
});

builder.register({
  name: 'pulse',
  type: 'pulse',
  version: 1,
  level: 'info',
  description: 'A request to send a pulse message.',
  fields: {
    routingKey: 'The requested routingKey of the message.',
  },
});

builder.register({
  name: 'irc',
  type: 'irc',
  version: 1,
  level: 'info',
  description: 'A request to send an irc message.',
  fields: {
    user: 'A user, if this is a request to direct message a user',
    channel: 'A channel (including #), if this is a request to post a message to a channel',
  },
});

module.exports = builder;
