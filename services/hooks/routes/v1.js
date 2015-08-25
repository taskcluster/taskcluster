var Promise     = require('promise');
var debug       = require('debug')('hooks:routes:v1');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var slugid      = require('slugid');

var api = new base.API({
  title:         "Hooks API Documentation",
  description:   "Todo",
  schemaPrefix:  'http://schemas.taskcluster.net/hooks/v1/'
});

// Export api
module.exports = api;

/** Get hook groups **/
api.declare({
  method:       'get',
  route:        '/hooks',
  name:         'listHookGroups',
  idempotent:   true,
  output:       'list-hook-groups-response.json',
  title:        'List hook groups',
  description:  'todo'
}, async function(req, res) {
  return this.Groups.query({}, {}).then(function(data) {
    var retval = {};
    retval.groups = data.entries.map(function(item) {
      return item.groupId;
    });
    return res.reply(retval);
  });
});


/** Get hooks in a given group **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup',
  name:         'listHooks',
  idempotent:   true,
  output:       'list-hooks-response.json',
  title:        'List hooks in a given group',
  description:  'todo'
}, async function(req, res) {
  return this.Hook.query({
    groupId: req.params.hookGroup
  }, {}).then(function(data) {
    var retval = {};
    Promise.all(data.entries.map(function(item) {
      return item.definition();
    })).then(function(results) {
      retval.hooks = results;
      return res.reply(retval);
    });
  });
});


/** Get hook definition **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'hook',
  idempotent:   true,
  output:       'hook-definition.json',
  title:        'Get hook definition',
  description:  'todo'
}, async function(req, res) {
  let hook = await this.Hook.load({
    groupId: req.params.hookGroup,
    hookId:  req.params.hookId
  }, true);

  // Handle the case where the hook doesn't exist
  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  // Create Hook definition
  let definition = await hook.definition();

  return res.reply(definition);
});


/** Create a hook **/
api.declare({
  method:       'put',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'createHook',
  idempotent:   true,
  //scopes:       [["hooks:modify-hook:<hookGroup>/<hookId>"]],
  input:        'create-hook-request.json',
  output:       'hook-definition.json',
  title:        'Create a hook',
  description:  'todo'
}, async function(req, res) {
  var hookGroup = req.params.hookGroup;
  var hookId    = req.params.hookId;
  var hookDef   = req.body;

  // Test if the group exists
  try {
    await this.Groups.load({ groupId: hookGroup });
  }
  catch(err) {
    if ( !err || err.code !== 'ResourceNotFound') {
      throw err;
    }
    await this.Groups.create({ groupId: hookGroup });
  }

  // Try to create a Hook entity
  try {
    let bindings = hookDef.bindings ?
      hookDef.bindings :
      {
        exchange:    'exchange/taskcluster-hooks/v1/trigger',
        routingKey:  hookGroup + '/' + hookId
      }

    var hook = await this.Hook.create({
      groupId:   hookGroup,
      hookId:    hookId,
      metadata:  hookDef.metadata,
      task:      hookDef.task,
      bindings:  bindings,
      deadline:  taskcluster.fromNow(hookDef.deadline),
      expires:   taskcluster.fromNow(hookDef.expiry)
    });
  }
  catch (err) {
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    return res.status(409).json({
      message: "hookGroup: " + hookGroup + " hookId: " + hookId +
        " already used by another task"
    });
  }

  let definition = await hook.definition();

  return res.reply(definition);
});


/** Update hook definition**/
api.declare({
  method:       'patch',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'updateHook',
  idempotent:   true,
  scopes:       [["hooks:modify-hook:<hookGroup>/<hookId>"]],
  input:        'create-hook-request.json',
  output:       'hook-definition.json',
  title:        'Update a hook',
  description:  'todo'
}, async function(req, res) {

});


/** Get secret token for a trigger **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup/:hookId/token',
  name:         'getTriggerToken',
  idempotent:   true,
  scopes:       [["hooks:get-trigger-token:<hookGroup>/<hookId>"]],
  title:        'Get a trigger token',
  description:  'todo'
}, async function(req, res) {

});


/** Reset a trigger token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/token',
  name:         'resetTriggerToken',
  idempotent:   true,
  scopes:       [["hooks:reset-trigger-token:<hookGroup>/<hookId>"]],
  title:        'Reset a trigger token',
  description:  'todo'
}, async function(req, res) {

});


/** Trigger hook from a webhook with a token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/trigger/:token',
  name:         'triggerHookWithToken',
  idempotent:   true,
  input:        'trigger-payload.json',
  output:       'trigger-response.json',
  title:        'Trigger a hook with a token',
  description:  'todo'
}, async function(req, res) {

});


/** Trigger a hook for debugging **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/trigger',
  name:         'triggerHook',
  idempotent:   true,
  scopes:       [["hooks:trigger-hook:<hookGroup>/<hookId>"]],
  deferAuth:    true,
  //input:        undefined,
  output:       'task-status.json',
  title:        'Trigger a hook',
  description:  'todo'
}, async function(req, res) {
  var hookGroup = req.params.hookGroup;
  var hookId    = req.params.hookId;

  var hook = await this.Hook.load({groupId: hookGroup, hookId: hookId}, true);

  // Return a 404 if the hook entity doesn't exist
  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  var definition = await hook.definition();
  var task = definition.task;
  task.deadline = taskcluster.fromNow('1 day');
  task.created = new Date().toJSON();
  var taskId = slugid.v4();
  this.queue.createTask(taskId, task).then(function(resp) {
    console.log(taskId);
    console.log(resp);
    return res.reply(resp)
  });
});
