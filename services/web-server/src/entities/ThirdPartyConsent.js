const assert = require('assert');
const Entity = require('azure-entities');

const ThirdPartyConsent = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('identities'),
  rowKey: Entity.keys.HashKey('identity'),
  properties: {
    // Registered third party client ID
    clientId: Entity.types.String,
    identity: Entity.types.String,
    expires: Entity.types.Date,
  },
});

/**
 * Expire ThirdPartyConsent entries.
 *
 * Returns a promise that all expired ThirdPartyConsent entries have been deleted
 */
ThirdPartyConsent.expire = async function(now) {
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

module.exports = ThirdPartyConsent;
