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
    'BlacklistedNotification',
  ],
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
  debug(`Received request to send email to ${req.body.address}`);
  await req.authorize(req.body);
  await this.notifier.email(req.body);
  res.sendStatus(200);
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
  debug(`Received request to publish message on ${req.body.routingKey}`);
  await req.authorize({routingKey: req.body.routingKey});
  await this.notifier.pulse(req.body);
  res.sendStatus(200);
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
  debug(`Received request to send irc message to ${input.channel || input.user}`);
  await req.authorize({
    channelRequest: input.channel !== undefined,
    channel: input.channel,
    user: input.user,
  });
  await this.notifier.irc(input);
  res.sendStatus(200);
});

builder.declare({
  method: 'post',
  route: '/blacklist/add',
  name: 'addBlacklistAddress',
  // scopes: {
  //   if: 'channelRequest',
  //   then: 'notify:irc-channel:<channel>',
  //   else: 'notify:irc-user:<user>',
  // },
  input: 'notification-address.yml',
  title: 'Blacklist Given Address',
  description: [
    'Add the given address to the notification blacklist. The address',
    'can be of either of the three supported address type namely pulse, email',
    'or IRC(user or channel). Addresses in the blacklist will be ignored',
    'by the notification service.',
  ].join('\n'),
}, async function(req, res) {
  // The address to blacklist
  let address = Object.assign({}, {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  });

  try {
    await this.BlacklistedNotification.create(address);
  } catch (e) {
    if (e.name === 'EntityAlreadyExistsError') {
      return res.reportError(
        'EntityAlreadyExists',
        'Notification address already exists in the blacklist',
        {}
      );
    } else {
      throw e;
    }
  }
  res.reply({});
});

builder.declare({
  method: 'get',
  route: '/blacklist/get',
  name: 'getBlacklistAddress',
  input: 'notification-address.yml',
  //output: 'notification-address.yml',
  //scopes: 'secrets:get:<name>',
  title: 'Read Blacklisted Notification',
  description: [
    'Read the notification, associated with some address, from the blacklist.',
    'If the caller lacks the scope necessary to get the notification, the call',
    'will fail with a 403 code regardless of whether the notification exists.',
  ].join('\n'),
}, async function(req, res) {
  let address = {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  };
  let item = undefined;
  try {
    item = await this.BlacklistedNotification.load(address, true);
  } catch (e) {
    if (e.name === 'ResourceNotFoundError') {
      return res.reportError('ResourceNotFound', 'Address not found in the blacklist', {});
    } else {
      throw e;
    }
  }
  if(item) {
    res.reply(item._properties);
  } else {
    res.reply(item);
  }
});

builder.declare({
  method: 'delete',
  route: '/blacklist/delete',
  name: 'deleteBlacklistAddress',
  //scopes: 'secrets:set:<name>',
  input: 'notification-address.yml',
  title: 'Delete Blacklisted Address',
  description: [
    'Delete the specified address from the notification blacklist.',
  ].join('\n'),
}, async function(req, res) {
  // The address to remove from the blacklist
  let address = {
    notificationType: req.body.notificationType,
    notificationAddress: req.body.notificationAddress,
  };

  try {
    await this.BlacklistedNotification.remove(address);
  } catch (e) {
    if (e.name === 'ResourceNotFoundError') {
      return res.reportError(
        'ResourceNotFound',
        'Notification address not found in the blacklist',
        {}
      );
    } else {
      throw e;
    }
  }
  res.reply({});
});

builder.declare({
  method: 'get',
  route: '/blacklist/list',
  name: 'list',
  output: 'notification-address-list.yml',
  title: 'List Blacklisted Notifications',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  description: [
    'Lists all the blacklisted addresses.',
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
  const query = await this.BlacklistedNotification.scan({}, {continuation, limit});

  return res.reply({
    addresses: query.entries.map(address => address._properties),
    continuationToken: query.continuation || undefined,
  });
});

builder.declare({
  method: 'put',
  route: '/blacklist/modify',
  name: 'modifyBlacklistAddress',
  // scopes: {
  //   if: 'channelRequest',
  //   then: 'notify:irc-channel:<channel>',
  //   else: 'notify:irc-user:<user>',
  // },
  input: 'modify-notification-address.yml',
  title: 'Modify Existing Blacklist Address',
  description: [
    'Modify an already existing blacklist address. The method throws an',
    'error if the address does not already exist in the blacklist',
  ].join('\n'),
}, async function(req, res) {
  //The address to add to the blacklist
  let oldAddress = Object.assign({}, {
    notificationType: req.body.oldAddress.notificationType,
    notificationAddress: req.body.oldAddress.notificationAddress,
  });

  let newAddress = Object.assign({}, {
    notificationType: req.body.newAddress.notificationType,
    notificationAddress: req.body.newAddress.notificationAddress,
  });

  try {
    // Retrieve old address
    let item = await this.BlacklistedNotification.load(oldAddress);
    // Modify the address
    await item.modify(function() {
      this.notificationType = newAddress.notificationType;
      this.notificationAddress = newAddress.notificationAddress;
    });
  } catch (e) {
    if (e.name === 'ResourceNotFoundError') {
      return res.reportError(
        'ResourceNotFound',
        'Notification address not found',
        {}
      );
    } else {
      throw e;
    }
  }
  res.reply({});
});
