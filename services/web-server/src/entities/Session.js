const assert = require('assert');
const Entity = require('azure-entities');

const Session = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('sessions'),
  rowKey: Entity.keys.StringKey('sessionId'),
  properties: {
    sessionId: Entity.types.String,
    sessionValue: Entity.types.JSON,
    expires: Entity.types.Date,
  },
});

/**
 * Expire Session entries.
 *
 * Returns a promise that all expired Session entries have been deleted
 */
Session.expire = async function(now) {
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

module.exports = Session;
