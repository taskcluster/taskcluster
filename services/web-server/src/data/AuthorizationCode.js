const assert = require('assert');
const Entity = require('azure-entities');

const AuthorizationCode = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('authorizationCodes'),
  rowKey: Entity.keys.StringKey('code'),
  signEntities: true,
  properties: {
    code: Entity.types.String,
    clientId: Entity.types.String,
    redirectUri: Entity.types.String,
    identity: Entity.types.String,
    identityProviderId: Entity.types.String,
    accessToken: Entity.types.EncryptedText,
    expires: Entity.types.Date,
    clientDetails: Entity.types.Schema({
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        description: { type: 'string' },
        scopes: { type: 'array' },
        expires: { type: 'string', format: 'date-time' },
        deleteOnExpiration: { type: 'boolean' },
      },
      required: [
        'clientId', 'description', 'scopes', 'expires',
      ],
    }),
  },
});

/**
 * Expire AuthorizationCode entries.
 *
 * Returns a promise that all expired AuthorizationCode entries have been deleted
 */
AuthorizationCode.expire = async function(now) {
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

module.exports = AuthorizationCode;
