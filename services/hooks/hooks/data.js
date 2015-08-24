var base   = require('taskcluster-base');
var debug  = require('debug')('hooks:data');
var assert = require('assert');
var Promise = require('promise');
var _       = require('lodash');

/** Entity for tracking hooks and associated state **/
var Hook = base.Entity.configure({
  version:        1,
  partitionKey:   base.Entity.keys.StringKey('groupId'),
  rowKey:         base.Entity.keys.StringKey('hookId'),
  properties: {
    groupId:      base.Entity.types.String,
    hookId:       base.Entity.types.String,
    metadata:     base.Entity.types.JSON,
    task:         base.Entity.types.JSON,
    bindings:     base.Entity.types.JSON,
    deadline:     base.Entity.types.Date,
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

/** Return promise for hook definition */
Hook.prototype.definition = function() {
  return Promise.resolve({
    metadata: _.cloneDeep(this.metadata),
    task:     _.cloneDeep(this.task),
    bindings: _.cloneDeep(this.bindings),
    deadline: this.deadline.toJSON(),
    expires:  this.expires.toJSON()
  });
};

// export Hook
exports.Hook = Hook;


/** Entity for tracking all groups **/
var Groups = base.Entity.configure({
  version:       1,
  partitionKey:  base.Entity.keys.ConstantKey('GroupKeys'),
  rowKey:        base.Entity.keys.StringKey('groupId'),
  properties: {
    groupId:     base.Entity.types.String
  }
});

// export Groups
exports.Groups = Groups;
