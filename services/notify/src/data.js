const Entity = require('azure-entities');

const BlacklistedNotification = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('notificationType'),
  rowKey: Entity.keys.StringKey('notificationAddress'),
  properties: {
    // the type could be email, pulse, irc-user or irc-channel
    notificationType: Entity.types.String,
    // the address of the blacklisted destination
    notificationAddress: Entity.types.String,
  },
});
