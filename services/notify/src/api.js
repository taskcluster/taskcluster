const APIBuilder = require('taskcluster-lib-api');
const debug = require('debug')('notify');
const Entity = require('azure-entities');

const builder = new APIBuilder({
  title: 'Notification Service',
  description: [
    'The notification service listens for tasks with associated notifications',
    'and handles requests to send emails and post pulse messages.',
  ].join('\n'),
  serviceName: 'notify',
  apiVersion: 'v1',
  context: [
    'notifier',
    'DenylistedNotification',
  ],
  errorCodes: {
    DenylistedAddress: 400,
  },
});

module.exports = builder;

builder.declare({
  method: 'post',
  route: '/email',
  name: 'email',
  scopes: 'notify:email:<address>',
  input: 'email-request.yml',
  title: 'Send an Email',
  description: [
    'Send an email to `address`. The content is markdown and will be rendered',
    'to HTML, but both the HTML and raw markdown text will be sent in the',
    'email. If a link is included, it will be rendered to a nice button in the',
    'HTML version of the email',
  ].join('\n'),
}, async function(req, res) {
  this.monitor.log.email({address: req.body.address});
  await req.authorize(req.body);

  let address = {
    notificationType: "email",
    notificationAddress: req.body.address,
  };
  // Ensure that the address is not in the denylist
  let response = await this.DenylistedNotification.load(address, true);
  if(response) {
    return res.reportError('DenylistedAddress', `${req.body.address} is denylisted`, {});
  } else {
    await this.notifier.email(req.body);
    res.sendStatus(200);
  }
});

builder.declare({
  method: 'post',
  route: '/pulse',
  name: 'pulse',
  scopes: 'notify:pulse:<routingKey>',
  input: 'pulse-request.yml',
  title: 'Publish a Pulse Message',
  description: [
    'Publish a message on pulse with the given `routingKey`.',
  ].join('\n'),
}, async function(req, res) {
  this.monitor.log.pulse({routingKey: req.body.routingKey});
  await req.authorize({routingKey: req.body.routingKey});
  await this.notifier.pulse(req.body);

  let notificationAddress = {
    notificationType: "pulse",
    notificationAddress: req.body.routingKey,
  };
  // Ensure that the address is not in the denylist
  let response = await this.DenylistedNotification.load(notificationAddress, true);
  if(response) {
    return res.reportError('DenylistedAddress', `${req.body.address} is denylisted`, {});
  } else {
    await this.notifier.pulse(req.body);
    res.sendStatus(200);
  }
});

builder.declare({
  method: 'post',
  route: '/irc',
  name: 'irc',
  scopes: {
    if: 'channelRequest',
    then: 'notify:irc-channel:<channel>',
    else: 'notify:irc-user:<user>',
  },
  input: 'irc-request.yml',
  title: 'Post IRC Message',
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
  this.monitor.log.irc({user: input.user, channel: input.channel});
  await req.authorize({
    channelRequest: input.channel !== undefined,
    channel: input.channel,
    user: input.user,
  });

  let notificationAddress = {
    notificationType: input.user ? "irc-user" : "irc-channel",
    notificationAddress: input.user ? input.user : input.channel,
  };
  // Ensure that the address is not in the denylist
  let response = await this.DenylistedNotification.load(notificationAddress, true);
  if(response) {
    return res.reportError('DenylistedAddress', `${input.channel || input.user} is denylisted`, {});
  } else {
    await this.notifier.irc(input);
    res.sendStatus(200);
  }
});

builder.declare({
  method: 'post',
  route: '/denylist/add',
  name: 'addDenylistAddress',
  scopes: 'notify:manage-denylist:<notificationType>/<notificationAddress>',
  input: 'notification-address.yml',
  title: 'Denylist Given Address',
  description: [
    'Add the given address to the notification denylist. The address',
    'can be of either of the three supported address type namely pulse, email',
    'or IRC(user or channel). Addresses in the denylist will be ignored',
    'by the notification service.',
  ].join('\n'),
}, async function(req, res) {
  // The address to denylist
  let address = {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  };

  await req.authorize(req.body);
  try {
    await this.DenylistedNotification.create(address);
  } catch (e) {
    if (e.name !== 'EntityAlreadyExistsError') {
      throw e;
    }
  }
  res.sendStatus(200);
});

builder.declare({
  method: 'delete',
  route: '/denylist/delete',
  name: 'deleteDenylistAddress',
  scopes: 'notify:manage-denylist:<notificationType>/<notificationAddress>',
  input: 'notification-address.yml',
  title: 'Delete Denylisted Address',
  description: [
    'Delete the specified address from the notification denylist.',
  ].join('\n'),
}, async function(req, res) {
  // The address to remove from the denylist
  let address = {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  };

  await req.authorize(req.body);
  try {
    await this.DenylistedNotification.remove(address);
  } catch (e) {
    if (e.name !== 'ResourceNotFoundError') {
      throw e;
    }
  }
  res.sendStatus(200);
});

builder.declare({
  method: 'get',
  route: '/denylist/list',
  name: 'list',
  output: 'notification-address-list.yml',
  title: 'List Denylisted Notifications',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  description: [
    'Lists all the denylisted addresses.',
    '',
    'By default this end-point will try to return up to 1000 addresses in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `list` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the members at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  const continuation = req.query.continuationToken || null;
  const limit = Math.min(parseInt(req.query.limit || 1000, 10), 1000);
  const query = await this.DenylistedNotification.scan({}, {continuation, limit});

  return res.reply({
    addresses: query.entries.map(address => {
      return {
        notificationType: address.notificationType,
        notificationAddress: address.notificationAddress,
      };
    }),
    continuationToken: query.continuation || undefined,
  });
});
