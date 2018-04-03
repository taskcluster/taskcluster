let API = require('taskcluster-lib-api');
let debug = require('debug')('notify');

let api = new API({
  title: 'Notification Service',
  description: [
    'The notification service, typically available at `notify.taskcluster.net`',
    'listens for tasks with associated notifications and handles requests to',
    'send emails and post pulse messages.',
  ].join('\n'),
  name: 'notify',
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
  scopes:       'notify:email:<address>',
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
  await req.authorize(req.body);
  await this.notifier.email(req.body);
  res.sendStatus(200);
});

api.declare({
  method:       'post',
  route:        '/pulse',
  name:         'pulse',
  scopes:       'notify:pulse:<routingKey>',
  input:        'pulse-request.json',
  title:        'Publish a Pulse Message',
  description: [
    'Publish a message on pulse with the given `routingKey`.',
  ].join('\n'),
}, async function(req, res) {
  debug(`Received request to publish message on ${req.body.routingKey}`);
  await req.authorize({routingKey: req.body.routingKey});
  await this.notifier.pulse(req.body);
  res.sendStatus(200);
});

api.declare({
  method:       'post',
  route:        '/irc',
  name:         'irc',
  scopes:       {
    if:   'channelRequest',
    then: 'notify:irc-channel:<channel>',
    else: 'notify:irc-user:<user>',
  },
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
  debug(`Received request to send irc message to ${input.channel || input.user}`);
  await req.authorize({
    channelRequest: input.channel !== undefined,
    channel: input.channel,
    user: input.user,
  });
  await this.notifier.irc(input);
  res.sendStatus(200);
});
