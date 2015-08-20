var base   = require('taskcluster-base');
var debug  = require('debug')('hooks:data');
var assert = require('assert');
var Promis = require('promise');


/** Entity for tracking hooks and associated state **/
var Hook = base.Entity.configure({
  version:        1,
  partitionKey:   base.Entity.keys.CompositeKey('groupId', 'hookId'),
  rowKey:         base.Entity.keys.StringKey('hook'),
  properties: {
    name:         base.Entity.types.String,
    deadline:     base.Entity.types.Date,
    data:         base.Entity.types.JSON,
    expires:      base.Entity.types.Date
  }
});

/**
 * Expire hooks that are past their expiration.
 *
 * Returns a promise that all expired hooks have been deleted
 */
Hook.expire = async function(now) {
  assert(now instanceof Date, "now must be given as option");
  var count = 0;
  await base.Entity.scan.call(this, {
    expires:  base.Entity.op.lessThan(now)
  }, {
    limit:    250, // max number of concurrent delete operations
    handler:  (hook) => { count++; return hook.remove(true); }
  });
  return count;
}

// export Hook
exports.Hook = Hook;
