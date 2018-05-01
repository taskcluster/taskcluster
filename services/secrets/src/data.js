const _ = require('lodash');
const assert = require('assert');
const Entity = require('azure-entities');

let Secret = Entity.configure({
  version:          1,
  signEntities:     true,
  partitionKey:     Entity.keys.ConstantKey('secrets'),
  rowKey:           Entity.keys.StringKey('name'),
  properties: {
    name:           Entity.types.String,
    secret:         Entity.types.EncryptedJSON,
    expires:        Entity.types.Date,
  },
});

// Export Secret
exports.Secret = Secret;

/** Return JSON representation of the secret */
Secret.prototype.json = function() {
  return {
    secret: _.cloneDeep(this.secret),
    expires: this.expires.toJSON(),
  };
};

/** Check if the resource is stale */
Secret.prototype.isExpired = function() {
  return (new Date()).getTime() > this.expires.getTime();
};

/**
 * Expire secrets that are past their expiration.
 *
 * Returns a promise that all expired secrets have been deleted.
 */
Secret.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (secret) => { count++; return secret.remove(true); },
  });
  return count;
};
