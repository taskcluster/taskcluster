const assert = require('assert');
const Entity = require('taskcluster-lib-entities');

const SessionStorage = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('sessions'),
  rowKey: Entity.keys.HashKey('sessionId'),
  signEntities: true,
  properties: {
    // The session ID
    sessionId: Entity.types.EncryptedText,
    // The session data
    data: Entity.types.JSON,
    // The expiration time of the table entry
    expires: Entity.types.Date,
  },
});

/**
 * Expire SessionStorage entries.
 *
 * Returns a promise that all expired SessionStorage entries have been deleted
 */
SessionStorage.expire = async function(now) {
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

module.exports = SessionStorage;
