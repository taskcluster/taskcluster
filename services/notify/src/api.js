const { APIBuilder, paginateResults } = require('taskcluster-lib-api');

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
    'denier',
    'db',
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
  category: 'Notifications',
  description: [
    'Send an email to `address`. The content is markdown and will be rendered',
    'to HTML, but both the HTML and raw markdown text will be sent in the',
    'email. If a link is included, it will be rendered to a nice button in the',
    'HTML version of the email',
  ].join('\n'),
}, async function(req, res) {
  await req.authorize(req.body);

  if (await this.denier.isDenied('email', req.body.address)) {
    return res.reportError('DenylistedAddress', `Email ${req.body.address} is denylisted`, {});
  }

  await this.notifier.email(req.body);
  res.sendStatus(200);
});

builder.declare({
  method: 'post',
  route: '/pulse',
  name: 'pulse',
  scopes: 'notify:pulse:<routingKey>',
  category: 'Notifications',
  input: 'pulse-request.yml',
  title: 'Publish a Pulse Message',
  description: [
    'Publish a message on pulse with the given `routingKey`.',
  ].join('\n'),
}, async function(req, res) {
  await req.authorize({ routingKey: req.body.routingKey });

  if (await this.denier.isDenied('pulse', req.body.routingKey)) {
    return res.reportError('DenylistedAddress', `Pulse routing key pattern ${req.body.routingKey} is denylisted`, {});
  }

  await this.notifier.pulse(req.body);
  res.sendStatus(200);
});

builder.declare({
  method: 'post',
  route: '/matrix',
  name: 'matrix',
  scopes: 'notify:matrix-room:<roomId>',
  input: 'matrix-request.yml',
  title: 'Post Matrix Message',
  category: 'Notifications',
  description: [
    'Post a message to a room in Matrix. Optionally includes formatted message.',
    '',
    'The `roomId` in the scopes is a fully formed `roomId` with leading `!` such',
    'as `!foo:bar.com`.',
    '',
    'Note that the matrix client used by taskcluster must be invited to a room before',
    'it can post there!',
  ].join('\n'),
}, async function(req, res) {
  await req.authorize({
    roomId: req.body.roomId,
  });

  if (await this.denier.isDenied('matrix-room', req.body.roomId)) {
    return res.reportError('DenylistedAddress', `Matrix room ${req.body.roomId} is denylisted`, {});
  }

  try {
    await this.notifier.matrix(req.body);
    res.sendStatus(200);
  } catch (err) {
    // This just means that we haven't been invited to the room yet
    if (err.errcode === 'M_FORBIDDEN') {
      res.reportError('InputError', `The taskcluster matrix client must be invited to ${req.body.roomId}`, {});
    }
    throw err;
  }
});

builder.declare({
  method: 'post',
  route: '/slack',
  name: 'slack',
  scopes: 'notify:slack-channel:<channelId>',
  input: 'slack-request.yml',
  title: 'Post Slack Message',
  category: 'Notifications',
  description: [
    'Post a message to a Slack channel.',
    '',
    'The `channelId` in the scopes is a Slack channel ID, starting with a capital C.',
    '',
    'The Slack app can post into public channels by default but will need to be added',
    'to private channels before it can post messages there.',
  ].join('\n'),
}, async function(req, res) {
  await req.authorize({
    channelId: req.body.channelId,
  });

  if (await this.denier.isDenied('slack-channel', req.body.channelId)) {
    return res.reportError('DenylistedAddress', `Slack channel ${req.body.channelId} is denylisted`, {});
  }

  await this.notifier.slack(req.body);
  res.sendStatus(200);
});

builder.declare({
  method: 'post',
  route: '/denylist/add',
  name: 'addDenylistAddress',
  scopes: 'notify:manage-denylist',
  input: 'notification-address.yml',
  title: 'Denylist Given Address',
  category: 'Denylist',
  description: [
    'Add the given address to the notification denylist. Addresses in the denylist will be ignored',
    'by the notification service.',
  ].join('\n'),
}, async function(req, res) {
  // The address to denylist
  let address = {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  };

  await req.authorize(req.body);
  await this.db.fns.add_denylist_address(address.notificationType, address.notificationAddress);
  res.sendStatus(200);
});

builder.declare({
  method: 'delete',
  route: '/denylist/delete',
  name: 'deleteDenylistAddress',
  scopes: 'notify:manage-denylist',
  input: 'notification-address.yml',
  category: 'Denylist',
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
  await this.db.fns.delete_denylist_address(address.notificationType, address.notificationAddress);
  res.sendStatus(200);
});

builder.declare({
  method: 'get',
  route: '/denylist/list',
  name: 'listDenylist',
  scopes: 'notify:manage-denylist',
  output: 'notification-address-list.yml',
  title: 'List Denylisted Notifications',
  category: 'Denylist',
  query: paginateResults.query,
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

  await req.authorize(req.body);
  const { continuationToken, rows } = await paginateResults({
    query: req.query,
    fetch: (size, offset) => this.db.fns.all_denylist_addresses(size, offset),
  });

  return res.reply({
    addresses: rows.map(address => {
      return {
        notificationType: address.notification_type,
        notificationAddress: address.notification_address,
      };
    }),
    continuationToken: continuationToken || undefined,
  });
});
