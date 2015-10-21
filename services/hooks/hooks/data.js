var base        = require('taskcluster-base');
var debug       = require('debug')('hooks:data');
var assert      = require('assert');
var Promise     = require('promise');
var taskcluster = require('taskcluster-client');
var _           = require('lodash');

/** Entity for tracking hooks and associated state **/
var Hook = base.Entity.configure({
  version:              1,
  partitionKey:         base.Entity.keys.StringKey('hookGroupId'),
  rowKey:               base.Entity.keys.StringKey('hookId'),
  signEntities:         true,
  properties:           {
    hookGroupId:        base.Entity.types.String,
    hookId:             base.Entity.types.String,
    metadata:           base.Entity.types.JSON,
    // task template
    task:               base.Entity.types.JSON,
    // pulse bindings (TODO; empty for now)
    bindings:           base.Entity.types.JSON,
    // timings for the task (in fromNow format, e.g., "1 day")
    deadline:           base.Entity.types.String,
    expires:            base.Entity.types.String,
    // schedule for this task (see schemas/schedule.yml)
    schedule:           base.Entity.types.JSON,
    // access token used to trigger this task via webhook
    triggerToken:       base.Entity.types.EncryptedText,
    // the taskId that will be used next time this hook is scheduled;
    // this allows scheduling to be idempotent
    nextTaskId:         base.Entity.types.SlugId,
    // next date at which this task is scheduled to run
    nextScheduledDate:  base.Entity.types.Date,
  }
});

/** Return promise for hook definition */
Hook.prototype.definition = function() {
  return Promise.resolve({
    hookId:       this.hookId,
    hookGroupId:  this.hookGroupId,
    metadata:     _.cloneDeep(this.metadata),
    task:         _.cloneDeep(this.task),
    schedule:     _.cloneDeep(this.schedule),
    deadline:     this.deadline,
    expires:      this.expires
  });
};

// export Hook
exports.Hook = Hook;
