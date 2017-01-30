var Entity      = require('azure-entities');
var debug       = require('debug')('hooks:data');
var assert      = require('assert');
var Promise     = require('promise');
var taskcluster = require('taskcluster-client');
var _           = require('lodash');

/** Entity for tracking hooks and associated state **/
var Hook = Entity.configure({
  version:              1,
  partitionKey:         Entity.keys.StringKey('hookGroupId'),
  rowKey:               Entity.keys.StringKey('hookId'),
  signEntities:         true,
  properties:           {
    hookGroupId:        Entity.types.String,
    hookId:             Entity.types.String,
    metadata:           Entity.types.JSON,
    // task template
    task:               Entity.types.JSON,
    // pulse bindings (TODO; empty for now)
    bindings:           Entity.types.JSON,
    // timings for the task (in fromNow format, e.g., "1 day")
    deadline:           Entity.types.String,
    expires:            Entity.types.String,
    // schedule for this task (see schemas/schedule.yml)
    schedule:           Entity.types.JSON,
    // access token used to trigger this task via webhook
    triggerToken:       Entity.types.EncryptedText,
    // the taskId that will be used next time this hook is scheduled;
    // this allows scheduling to be idempotent
    nextTaskId:         Entity.types.EncryptedText,
    // next date at which this task is scheduled to run
    nextScheduledDate:  Entity.types.Date,
  },
}).configure({
  version:              2,
  signEntities:         true,
  properties:           {
    hookGroupId:        Entity.types.String,
    hookId:             Entity.types.String,
    metadata:           Entity.types.JSON,
    // task template
    task:               Entity.types.JSON,
    // pulse bindings (TODO; empty for now)
    bindings:           Entity.types.JSON,
    // timings for the task (in fromNow format, e.g., "1 day")
    deadline:           Entity.types.String,
    expires:            Entity.types.String,
    // schedule for this task (see schemas/schedule.yml)
    schedule:           Entity.types.JSON,
    // access token used to trigger this task via webhook
    triggerToken:       Entity.types.EncryptedText,
    // the taskId that will be used next time this hook is scheduled;
    // this allows scheduling to be idempotent
    nextTaskId:         Entity.types.EncryptedText,
    // next date at which this task is scheduled to run
    nextScheduledDate:  Entity.types.Date,
  },
  migrate: function(item) {
    // remove the task timestamps, as they are overwritten when the hook fires
    // (bug 1225234)
    delete item.task.created;
    delete item.task.expires;
    delete item.task.deadline;
    return item;
  },
}).configure({
  version:              3,
  signEntities:         true,
  properties:           {
    hookGroupId:        Entity.types.String,
    hookId:             Entity.types.String,
    metadata:           Entity.types.JSON,
    // task template
    task:               Entity.types.JSON,
    // pulse bindings (TODO; empty for now)
    bindings:           Entity.types.JSON,
    // timings for the task (in fromNow format, e.g., "1 day")
    deadline:           Entity.types.String,
    expires:            Entity.types.String,
    // schedule for this task (see schemas/schedule.yml)
    schedule:           Entity.types.JSON,
    // access token used to trigger this task via webhook
    triggerToken:       Entity.types.EncryptedText,
    // information about the last time this hook fired:
    // {error: ".."} or {taskId: ".."}
    lastFire:           Entity.types.JSON,
    // the taskId that will be used next time this hook is scheduled;
    // this allows scheduling to be idempotent
    nextTaskId:         Entity.types.EncryptedText,
    // next date at which this task is scheduled to run
    nextScheduledDate:  Entity.types.Date,
  },
  migrate: function(item) {
    item.lastFire = {result: 'no-fire'};
    return item;
  },
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
    expires:      this.expires,
  });
};

// export Hook
exports.Hook = Hook;
