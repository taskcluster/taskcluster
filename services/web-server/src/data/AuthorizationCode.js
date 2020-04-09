const assert = require('assert');
const Entity = require('taskcluster-lib-entities');

const AuthorizationCode = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('authorizationCodes'),
  rowKey: Entity.keys.StringKey('code'),
  signEntities: true,
  properties: {
    // The authorization code received from the authorization server
    code: Entity.types.String,
    // The client identifier issued to the client during the registration process
    clientId: Entity.types.String,
    // The redirection endpoint URI after completing interaction with the resource owner
    redirectUri: Entity.types.String,
    // The login identity assigned by the login strategy used
    identity: Entity.types.String,
    // The name of the login strategy used
    identityProviderId: Entity.types.String,
    // The expiration time of the table entry
    expires: Entity.types.Date,
    /**
     * Client details object with properties:
     * - clientId           // The client ID
     * - description        // The client description
     * - scopes             // List of scopes
     * - expires            // Date time when the client expires
     * - deleteOnExpiration // if true, can be deleted after expiration
     */
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
