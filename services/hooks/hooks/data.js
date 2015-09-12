var base   = require('taskcluster-base');
var debug  = require('debug')('hooks:data');
var assert = require('assert');
var Promise = require('promise');
var _       = require('lodash');
var datejs  = require('date.js');

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
  payload.deadline = datejs(this.deadline).toJSON();
  if (this.expires) {
    payload.expires = datejs(this.expires).toJSON();
  }
  return Promise.resolve(payload);
}

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
