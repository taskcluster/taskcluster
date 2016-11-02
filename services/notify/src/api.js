let API = require('taskcluster-lib-api');
let debug = require('debug')('notify');

let api = new API({
  title: 'Notification Service',
  description: [
    'The notification service, typically available at `notify.taskcluster.net`',
    'listens for tasks with associated notifications and handles requests to',
    'send emails and post pulse messages.',
  ].join('\n'),
  schemaPrefix: 'http://schemas.taskcluster.net/notify/v1/',
  context: [
    'notifier',
  ],
});

module.exports = api;

api.declare({
  method:       'post',
  route:        '/email',
  name:         'email',
  scopes:       [['notify:email:<address>']],
  deferAuth:    true,
  input:        'email-request.json',
  title:        'Send an Email',
  description: [
    'Send an email to `address`. The content is markdown and will be rendered',
    'to HTML, but both the HTML and raw markdown text will be sent in the',
    'email. If a link is included, it will be rendered to a nice button in the',
    'HTML version of the email',
  ].join('\n'),
}, async function(req, res) {
  debug(`Received request to send email to ${req.body.address}`);
  if (!req.satisfies({address: req.body.address})) {
    debug(`Scopes were not met for sending email to ${req.body.address}. Aborting.`);
    return;
  }
  await this.notifier.email(req.body);
  res.sendStatus(200);
});

api.declare({
  method:       'post',
  route:        '/pulse',
  name:         'pulse',
  scopes:       [['notify:pulse:<routingKey>']],
  deferAuth:    true,
  input:        'pulse-request.json',
  title:        'Publish a Pulse Message',
  description: [
    'Publish a message on pulse with the given `routingKey`.',
  ].join('\n'),
}, async function(req, res) {
  debug(`Received request to publish message on ${req.body.routingKey}`);
  if (!req.satisfies({routingKey: req.body.routingKey})) {
    debug(`Scopes were not met for publishing message on ${req.body.routingKey}. Aborting.`);
    return;
  }
  await this.notifier.pulse(req.body);
  res.sendStatus(200);
});

api.declare({
  method:       'post',
  route:        '/irc',
  name:         'irc',
  scopes:       [['notify:irc-channel:<channel>', 'notify:irc-user:<user>']],
  deferAuth:    true,
  input:        'irc-request.json',
  title:        'Post IRC Message',
  description: [
    'Post a message on IRC to a specific channel or user, or a specific user',
    'on a specific channel.',
    '',
    'Success of this API method does not imply the message was successfully',
    'posted. This API method merely inserts the IRC message into a queue',
    'that will be processed by a background process.',
    'This allows us to re-send the message in face of connection issues.',
    '',
    'However, if the user isn\'t online the message will be dropped without',
    'error. We maybe improve this behavior in the future. For now just keep',
    'in mind that IRC is a best-effort service.',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  let required = [];
  if (input.channel) {
    debug(`Received request to send irc message to channel ${input.channel}`);
    required.push('notify:irc-channel:' + input.channel);
  }
  if (input.user) {
    debug(`Received request to send irc message to user ${input.user}`);
    required.push('notify:irc-user:' + input.user);
  }
  if (!req.satisfies([required])) {
    debug(`Scopes were not met for sending irc message to ${input.user || input.channel}. Aborting.`);
    return;
  }
  await this.notifier.irc(input);
  res.sendStatus(200);
});