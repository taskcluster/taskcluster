const _ = require('lodash');
const assert = require('assert');
const Entity = require('azure-entities');

let SecretEntity = Entity.configure({
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

// Export SecretEntity
exports.SecretEntity = SecretEntity;

/** Return JSON representation of the secret */
SecretEntity.prototype.json = function() {
  return {
    secret: _.cloneDeep(this.secret),
    expires: this.expires.toJSON(),
  };
};

/** Check if the resource is stale */
SecretEntity.prototype.isExpired = function() {
  return (new Date()).getTime() > this.expires.getTime();
};

/**
 * Expire secrets that are past their expiration.
 *
 * Returns a promise that all expired secrets have been deleted.
 */
SecretEntity.expire = async function(now) {
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
