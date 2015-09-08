var Promise     = require('promise');
var debug       = require('debug')('hooks:routes:v1');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var slugid      = require('slugid');
var datejs      = require('date.js');

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
  description: [
    "This endpoint will return a list of all available groups that defined",
    "hooks belong to."
  ].join('\n')
}, async function(req, res) {
  var groups = [];
  await this.Groups.query({},{
    handler: (item) => {
      groups.push(item.groupId);
    }
  });
  return res.reply({groups: groups});
});


/** Get hooks in a given group **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup',
  name:         'listHooks',
  idempotent:   true,
  output:       'list-hooks-response.json',
  title:        'List hooks in a given group',
  description: [
    "Get a list of all the hook definitions within a given hook group."
  ].join('\n')
}, async function(req, res) {
  var hooks = [];
  await this.Hook.query({
    groupId: req.params.hookGroup
  }, {
    handler: async (hook) => {
      hooks.push(await hook.definition());
    }
  });
  return res.reply({hooks: hooks});
});


/** Get hook definition **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'hook',
  idempotent:   true,
  output:       'hook-definition.json',
  title:        'Get hook definition',
  description: [
    "This end-point will return the hook-defintion."
  ].join('\n')
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

  // Reply with the hook definition
  let definition = await hook.definition();
  return res.reply(definition);
});

/** Get next scheduled hook date */
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup/:hookId/schedule',
  name:         'getHookSchedule',
  output:       'hook-schedule.json',
  title:        'Get hook schedule',
  description: [
    "This end-point will return the next scheduled date of a hook."
  ].join('\n')
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

  // Return a schedule only if a schedule is defined
  if (hook.schedule) {
    return res.reply({
      schedule: hook.schedule,
      nextScheduledDate: hook.nextScheduledDate.toJSON()
    });
  }
  return res.reply({});
});

/** Create a hook **/
api.declare({
  method:       'put',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'createHook',
  idempotent:   true,
  scopes:       [["hooks:modify-hook:<hookGroup>/<hookId>"]],
  input:        'create-hook-request.json',
  output:       'hook-definition.json',
  title:        'Create a hook',
  description: [
    "Define and create a hook that will spawn a task when triggered. This",
    "hook can be triggered through the web endpoint, or through a message",
    "on the Pulse exchange that the hook is binded to."
  ].join('\n')
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
        exchange:    '',
        routingKey:  '#'
      }

    var hook = await this.Hook.create({
      groupId:            hookGroup,
      hookId:             hookId,
      metadata:           hookDef.metadata,
      task:               hookDef.task,
      bindings:           bindings,
      deadline:           hookDef.deadline,
      expires:            hookDef.expires ? hookDef.expires :    '',
      schedule:           hookDef.schedule ? hookDef.schedule :  '',
      accessToken:        slugid.v4(),
      nextTaskId:         slugid.v4(),
      nextScheduledDate:  hookDef.schedule? datejs(hookDef.schedule) : new Date(0)
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

  // Reply with the hook definition
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
  description: [
    "Update the hook definition."
  ].join('\n')
}, async function(req, res) {
  var hookGroup = req.params.hookGroup;
  var hookId = req.params.hookId;
  var hookDef = req.body;

  var hook = await this.Hook.load({
    groupId: hookGroup,
    hookId: hookId
  }, true);

  if (!hook) {
    return res.status(404).json({
      message: "Hook not found. " +
        "Use PUT instead of PATCH to create a resource."
    });
  }

  let bindings = hookDef.bindings ?
    hookDef.bindings :
    {
      exchange:    '',
      routingKey:  '#'
    };

  // Attempt to modify properties of the hook
  await hook.modify((hook) => {
    hook.metadata          = hookDef.metadata;
    hook.task              = hookDef.task;
    hook.bindings          = bindings;
    hook.deadline          = hookDef.deadline;
    hook.expires           = hookDef.expires ? hookDef.expires : '';
    hook.schedule          = hookDef.schedule ? hookDef.schedule : '';
    hook.nextScheduledDate = hookDef.schedule ? datejs(hookDef.schedule) : new Date(0);
  });

  let definition = await hook.definition();
  return res.reply(definition);
});

/** Delete hook definition**/
api.declare({
  method:       'delete',
  route:        '/hooks/:hookGroup/:hookId',
  name:         'removeHook',
  idempotent:   true,
  scopes:       [["hooks:modify-hook:<hookGroup>/<hookId>"]],
  title:        'Delete a hook',
  description: [
    "Remove a hook definition."
  ].join('\n')
}, async function(req, res) {
  var groupId = req.params.hookGroup;
  var hookId = req.params.hookId;

  // Remove the resource if it exists
  let hook = await this.Hook.load({
    groupId: groupId,
    hookId: hookId
  }, true);

  if (!hook) {
    return res.status(404).json({
      message: "Resource does not exist."
    });
  }

  await hook.remove();

  // Remove the groupId if it's unmapped
  var removeGroup = true;
  await this.Hook.query({
    groupId: groupId
  }, {
    handler: () => {
      removeGroup = false;
    }
  });

  if (removeGroup) {
    let group = await this.Groups.load({groupId: groupId}, true);
    if (group) {
      await group.remove();
    }
  }
  return res.status(200).json({});
});

/** Get secret token for a trigger **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroup/:hookId/token',
  name:         'getTriggerToken',
  scopes:       [["hooks:get-trigger-token:<hookGroup>/<hookId>"]],
  input:        undefined,
  output:       'trigger-token-response.json',
  title:        'Get a trigger token',
  description: [
    "Retrieve a unique secret token for triggering the specified hook. This",
    "token can be deactivated with resetTriggerToken."
  ].join('\n')
}, async function(req, res) {
  let hook = await this.Hook.load({
    groupId: req.params.hookGroup,
    hookId:  req.params.hookId
  }, true);

  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  return res.reply({
    token: hook.accessToken
  });
});


/** Reset a trigger token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/token',
  name:         'resetTriggerToken',
  scopes:       [["hooks:reset-trigger-token:<hookGroup>/<hookId>"]],
  input:        undefined,
  output:       'trigger-token-response.json',
  title:        'Reset a trigger token',
  description: [
    "Reset the token for triggering a given hook. This invalidates token that",
    "may have been issued via getTriggerToken with a new token."
  ].join('\n')
}, async function(req, res) {
  let hook = await this.Hook.load({
    groupId: req.params.hookGroup,
    hookId:  req.params.hookId
  }, true);

  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  await hook.modify((hook) => {
    hook.accessToken = slugid.v4();
  });

  return res.reply({
    token: hook.accessToken
  });
});


/** Trigger hook from a webhook with a token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/trigger/:token',
  name:         'triggerHookWithToken',
  input:        'trigger-payload.json',
  output:       'task-status.json',
  title:        'Trigger a hook with a token',
  description: [
    "This endpoint triggers a defined hook with a valid token."
  ].join('\n')
}, async function(req, res) {
  var hook = await this.Hook.load({
    groupId: req.params.hookGroup,
    hookId:  req.params.hookId
  }, true);

  // Return a 404 if the hook entity doesn't exist
  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  // Return 401 if the token doesn't match
  if (req.params.token !== hook.accessToken) {
    return res.status(401).json({
      message: "Invalid token"
    });
  }

  let payload = await hook.taskPayload();
  let resp = await this.queue.createTask(slugid.v4(), payload);
  return res.reply(resp);
});


/** Trigger a hook for debugging **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroup/:hookId/trigger',
  name:         'triggerHook',
  scopes:       [["hooks:trigger-hook:<hookGroup>/<hookId>"]],
  output:       'task-status.json',
  title:        'Trigger a hook',
  description: [
    "Trigger a hook, given that you have the correct scoping for it"
  ].join('\n')
}, async function(req, res) {
  var hook = await this.Hook.load({
    groupId: req.params.hookGroup,
    hookId:  req.params.hookId
  }, true);

  // Return a 404 if the hook entity doesn't exist
  if (!hook) {
    return res.status(404).json({
      message: "Hook not found"
    });
  }

  let payload = await hook.taskPayload();
  let resp = await this.queue.createTask(slugid.v4(), payload);
  return res.reply(resp);
});
