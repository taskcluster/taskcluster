const assert = require('assert');
const Entity = require('azure-entities');

const AccessToken = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('accessTokens'),
  rowKey: Entity.keys.HashKey('accessToken'),
  signEntities: true,
  properties: {
    accessToken: Entity.types.String,
    clientId: Entity.types.String,
    redirectUri: Entity.types.String,
    identity: Entity.types.String,
    identityProviderId: Entity.types.String,
    expires: Entity.types.Date,
  },
});

/**
 * Expire AccessToken entries.
 *
 * Returns a promise that all expired AuthorizationCode entries have been deleted
 */
AccessToken.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires: Entity.op.lessThan(now),
  }, {
    limit: 250, // max number of concurrent delete operations
    handler: entry => { count++; return entry.remove(true); },
  });

  return count;
};

module.exports = AccessToken;
