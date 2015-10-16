var base        = require('taskcluster-base');
var debug       = require('debug')('hooks:data');
var assert      = require('assert');
var Promise     = require('promise');
var taskcluster = require('taskcluster-client');
var _           = require('lodash');

/** Entity for tracking hooks and associated state **/
var Hook = base.Entity.configure({
  version:              1,
  partitionKey:         base.Entity.keys.StringKey('groupId'),
  rowKey:               base.Entity.keys.StringKey('hookId'),
  properties:           {
    groupId:            base.Entity.types.String,
    hookId:             base.Entity.types.String,
    metadata:           base.Entity.types.JSON,
    task:               base.Entity.types.JSON,
    bindings:           base.Entity.types.JSON,
    deadline:           base.Entity.types.String,
    expires:            base.Entity.types.String,
    schedule:           base.Entity.types.JSON,
    accessToken:        base.Entity.types.SlugId,
    nextTaskId:         base.Entity.types.SlugId,
    nextScheduledDate:  base.Entity.types.Date,
  }
});

/** Return promise for hook definition */
Hook.prototype.definition = function() {
  return Promise.resolve({
    hookId:   this.hookId,
    groupId:  this.groupId,
    metadata: _.cloneDeep(this.metadata),
    task:     _.cloneDeep(this.task),
    bindings: _.cloneDeep(this.bindings),
    schedule: _.cloneDeep(this.schedule),
    deadline: this.deadline,
    expires:  this.expires
  });
};

Hook.prototype.taskPayload = function() {
  let payload = _.cloneDeep(this.task);
  payload.created = new Date().toJSON();
  payload.deadline = taskcluster.fromNow(this.deadline).toJSON();
  if (this.expires) {
    payload.expires = taskcluster.fromNow(this.expires).toJSON();
  }
  return Promise.resolve(payload);
}

// export Hook
exports.Hook = Hook;
