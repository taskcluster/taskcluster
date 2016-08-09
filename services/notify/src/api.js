let base = require('taskcluster-base');
let debug = require('debug')('notify');

let api = new base.API({
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
    'email.',
  ].join('\n'),
}, async function(req, res) {
  if (!req.satisfies({address: req.body.address})) {
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
  if (!req.satisfies({routingKey: req.body.routingKey})) {
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
    required.push('notify:irc-channel:' + input.channel);
  }
  if (input.user) {
    required.push('notify:irc-user:' + input.user);
  }
  if (!req.satisfies([required])) {
    return;
  }
  await this.notifier.irc(input);
  res.sendStatus(200);
});

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    'Ping Server',
  description: [
    'Documented later...',
    '',
    '**Warning** this api end-point is **not stable**.',
  ].join('\n'),
}, function(req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime(),
  });
});
