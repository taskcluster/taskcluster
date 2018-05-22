const parser = require('cron-parser');
const debug = require('debug')('hooks:routes:v1');
const Promise = require('promise');
const taskcluster = require('taskcluster-client');
const API = require('taskcluster-lib-api');
const nextDate = require('../src/nextdate');
const _ = require('lodash');
const Ajv = require('ajv');

const api = new API({
  title:         'Hooks API Documentation',
  description:   [
    'Hooks are a mechanism for creating tasks in response to events.',
    '',
    'Hooks are identified with a `hookGroupId` and a `hookId`.',
    '',
    'When an event occurs, the resulting task is automatically created.  The',
    'task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,',
    'which must have scopes to make the createTask call, including satisfying all',
    'scopes in `task.scopes`.  The new task has a `taskGroupId` equal to its',
    '`taskId`, as is the convention for decision tasks.',
    '',
    'Hooks can have a "schedule" indicating specific times that new tasks should',
    'be created.  Each schedule is in a simple cron format, per ',
    'https://www.npmjs.com/package/cron-parser.  For example:',
    ' * `[\'0 0 1 * * *\']` -- daily at 1:00 UTC',
    ' * `[\'0 0 9,21 * * 1-5\', \'0 0 12 * * 0,6\']` -- weekdays at 9:00 and 21:00 UTC, weekends at noon',
    '',
    'The task definition is used as a JSON-e template, with a context depending on how it is fired.  See',
    'https://docs.taskcluster.net/reference/core/taskcluster-hooks/docs/firing-hooks',
    'for more information.',
  ].join('\n'),
  name: 'hooks',
  context: ['Hook', 'taskcreator'],
  schemaPrefix:  'http://schemas.taskcluster.net/hooks/v1/',
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
  stability:    'stable',
  description: [
    'This endpoint will return a list of all hook groups with at least one hook.',
  ].join('\n'),
}, async function(req, res) {
  const groups = new Set();
  await this.Hook.scan({}, {
    handler: (item) => {
      groups.add(item.hookGroupId);
    },
  });
  return res.reply({groups: Array.from(groups)});
});

/** Get hooks in a given group **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroupId',
  name:         'listHooks',
  idempotent:   true,
  output:       'list-hooks-response.json',
  title:        'List hooks in a given group',
  stability:    'stable',
  description: [
    'This endpoint will return a list of all the hook definitions within a',
    'given hook group.',
  ].join('\n'),
}, async function(req, res) {
  const hooks = [];
  await this.Hook.query({
    hookGroupId: req.params.hookGroupId,
  }, {
    handler: async (hook) => {
      hooks.push(await hook.definition());
    },
  });
  if (hooks.length == 0) {
    return res.reportError('ResourceNotFound', 'No such group', {});
  }
  return res.reply({hooks: hooks});
});

/** Get hook definition **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroupId/:hookId',
  name:         'hook',
  idempotent:   true,
  output:       'hook-definition.json',
  title:        'Get hook definition',
  stability:    'stable',
  description: [
    'This endpoint will return the hook definition for the given `hookGroupId`',
    'and hookId.',
  ].join('\n'),
}, async function(req, res) {
  let hook = await this.Hook.load({
    hookGroupId: req.params.hookGroupId,
    hookId: req.params.hookId,
  }, true);

  // Handle the case where the hook doesn't exist
  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // Reply with the hook definition
  let definition = await hook.definition();
  return res.reply(definition);
});

/** Get hook's current status */
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroupId/:hookId/status',
  name:         'getHookStatus',
  output:       'hook-status.json',
  title:        'Get hook status',
  stability:    'stable',
  description: [
    'This endpoint will return the current status of the hook.  This represents a',
    'snapshot in time and may vary from one call to the next.',
  ].join('\n'),
}, async function(req, res) {
  let hook = await this.Hook.load({
    hookGroupId: req.params.hookGroupId,
    hookId: req.params.hookId,
  }, true);

  // Handle the case where the hook doesn't exist
  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  let reply = {lastFire: hook.lastFire};

  // Return a schedule only if a schedule is defined
  if (hook.schedule.length > 0) {
    reply.nextScheduledDate = hook.nextScheduledDate.toJSON();
    // Remark: nextTaskId cannot be exposed here, it's a secret.
    // If someone could predict the taskId they could use it, breaking this
    // service at best, at worst maybe exploit it to elevate from defineTask
    // to createTask without scope to schedule a task.
  }
  return res.reply(reply);
});

/** Create a hook **/
api.declare({
  method:       'put',
  route:        '/hooks/:hookGroupId/:hookId',
  name:         'createHook',
  idempotent:   true,
  scopes:       {AllOf:
    ['hooks:modify-hook:<hookGroupId>/<hookId>', 'assume:hook-id:<hookGroupId>/<hookId>'],
  },
  input:        'create-hook-request.json',
  output:       'hook-definition.json',
  title:        'Create a hook',
  stability:    'stable',
  description: [
    'This endpoint will create a new hook.',
    '',
    'The caller\'s credentials must include the role that will be used to',
    'create the task.  That role must satisfy task.scopes as well as the',
    'necessary scopes to add the task to the queue.',,
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  const hookDef = req.body;

  if (req.body.hookGroupId && hookGroupId !== req.body.hookGroupId) {
    return res.reportError('InputError', 'Hook Group Ids do not match', {});
  }

  if (req.body.hookId && hookId !== req.body.hookId) {
    return res.reportError('InputError', 'Hook Ids do not match', {});
  }

  hookDef.hookGroupId = hookGroupId;
  hookDef.hookId = hookId;

  await req.authorize({hookGroupId, hookId});

  // Validate cron-parser expressions
  _.forEach(hookDef.schedule, function(schedule) {
    try {
      parser.parseExpression(schedule);
    } catch (err) {
      return res.reportError('InputError',
        '{{message}} in {{schedule}}', {message: err.message, schedule});
    }
  });
  // Try to create a Hook entity
  try {
    const hook = await this.Hook.create(
      _.defaults({}, hookDef, {
        bindings:           [], // TODO
        triggerToken:       taskcluster.slugid(),
        lastFire:           {result: 'no-fire'},
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  nextDate(hookDef.schedule),

      }));
  } catch (err) {
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    const existingHook = await this.Hook.load({hookGroupId, hookId}, true);

    if (!_.isEqual(hookDef, await existingHook.definition())) {
      return res.reportError('RequestConflict',
        'hook `' + hookGroupId + '/' + hookId + '` already exists.',
        {});
    }
  }

  // Reply with the hook definition
  return res.reply(hookDef);
});

/** Update hook definition**/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroupId/:hookId',
  name:         'updateHook',
  idempotent:   true,
  scopes:       {AllOf:
    ['hooks:modify-hook:<hookGroupId>/<hookId>', 'assume:hook-id:<hookGroupId>/<hookId>'],
  },
  input:        'create-hook-request.json',
  output:       'hook-definition.json',
  title:        'Update a hook',
  stability:    'stable',
  description: [
    'This endpoint will update an existing hook.  All fields except',
    '`hookGroupId` and `hookId` can be modified.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  const hookDef = req.body;

  if (req.body.hookGroupId && hookGroupId !== req.body.hookGroupId) {
    return res.reportError('InputError', 'Hook Group Ids do not match', {});
  }

  if (req.body.hookId && hookId !== req.body.hookId) {
    return res.reportError('InputError', 'Hook Ids do not match', {});
  }

  hookDef.hookGroupId = hookGroupId;
  hookDef.hookId = hookId;

  await req.authorize({hookGroupId, hookId});

  const hook = await this.Hook.load({hookGroupId, hookId}, true);

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // Attempt to modify properties of the hook
  const schedule = hookDef.schedule ? hookDef.schedule : [];
  _.forEach(schedule, function(schedule) {
    try {
      parser.parseExpression(schedule);
    } catch (err) {
      return res.reportError('InputError',
        '{{message}} in {{schedule}}', {message: err.message, schedule});
    }
  });

  await hook.modify((hook) => {
    hook.metadata          = hookDef.metadata;
    hook.task              = hookDef.task;
    hook.triggerSchema     = hookDef.triggerSchema;
    hook.deadline          = hookDef.deadline;
    hook.expires           = hookDef.expires ? hookDef.expires : '';
    hook.schedule          = schedule;
    hook.nextTaskId        = taskcluster.slugid();
    hook.nextScheduledDate = nextDate(schedule);
  });

  let definition = await hook.definition();
  return res.reply(definition);
});

/** Delete hook definition**/
api.declare({
  method:       'delete',
  route:        '/hooks/:hookGroupId/:hookId',
  name:         'removeHook',
  idempotent:   true,
  scopes:       'hooks:modify-hook:<hookGroupId>/<hookId>',
  title:        'Delete a hook',
  stability:    'stable',
  description: [
    'This endpoint will remove a hook definition.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;

  await req.authorize({hookGroupId, hookId});

  // Remove the resource if it exists
  await this.Hook.remove({hookGroupId, hookId}, true);

  return res.status(200).json({});
});

/** Trigger a hook **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroupId/:hookId/trigger',
  name:         'triggerHook',
  scopes:       'hooks:trigger-hook:<hookGroupId>/<hookId>',
  input:        'trigger-hook.json',
  output:       'task-status.json',
  title:        'Trigger a hook',
  stability:    'stable',
  description: [
    'This endpoint will trigger the creation of a task from a hook definition.',
    '',
    'The HTTP payload must match the hook\s `triggerSchema`.  If it does, it is',
    'provided as the `payload` property of the JSON-e context used to render the',
    'task template.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId      = req.params.hookId;

  await req.authorize({hookGroupId, hookId});

  let lastFire;
  let resp;
  const payload = req.body;
  const hook = await this.Hook.load({hookGroupId, hookId}, true);
  let error = null;
  const ajv = new Ajv({format: 'full', verbose: true, allErrors: true});

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }
  //Using ajv lib to check if the context respect the triggerSchema
  const validate = ajv.compile(hook.triggerSchema);

  if (validate && payload) {
    let valid = validate(payload);
    if (!valid) {
      return res.reportError('InputError', '{{message}}', {
        message: ajv.errorsText(validate.errors, {separator: '; '}
        )});
    }
  } 
  // build the context for the task creation
  let context = {
    firedBy: 'triggerHook',
    payload: payload,
  };

  try {
    resp = await this.taskcreator.fire(hook, context);
    lastFire = {
      result: 'success',
      taskId: resp.status.taskId,
      time: new Date(),
    };
  } catch (err) {
    error = err;
    lastFire = {
      result: 'error',
      error: err,
      time: new Date(),
    };
  }

  await hook.modify((hook) => {
    hook.lastFire = lastFire;
  });

  if (resp) {
    return res.reply(resp);
  } else if (error.requestInfo && error.code) {
    // handle errors from further API calls specially
    return res.reportError(
      'InputError',
      `While calling queue.createTask: ${error.code}\n\n${error.message}`,
      {createTask: error.requestInfo});
  } else {
    return res.reportError(
      'InputError',
      'While firing hook:\n\n{{error}}',
      {error: (error || 'unknown').toString()});
  }
});

/** Get secret token for a trigger **/
api.declare({
  method:       'get',
  route:        '/hooks/:hookGroupId/:hookId/token',
  name:         'getTriggerToken',
  scopes:       'hooks:get-trigger-token:<hookGroupId>/<hookId>',
  input:        undefined,
  output:       'trigger-token-response.json',
  title:        'Get a trigger token',
  stability:    'stable',
  description: [
    'Retrieve a unique secret token for triggering the specified hook. This',
    'token can be deactivated with `resetTriggerToken`.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  await req.authorize({hookGroupId, hookId});

  const hook = await this.Hook.load({hookGroupId, hookId}, true);

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  return res.reply({
    token: hook.triggerToken,
  });
});

/** Reset a trigger token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroupId/:hookId/token',
  name:         'resetTriggerToken',
  scopes:       'hooks:reset-trigger-token:<hookGroupId>/<hookId>',
  input:        undefined,
  output:       'trigger-token-response.json',
  title:        'Reset a trigger token',
  stability:    'stable',
  description: [
    'Reset the token for triggering a given hook. This invalidates token that',
    'may have been issued via getTriggerToken with a new token.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;

  await req.authorize({hookGroupId, hookId});

  let hook = await this.Hook.load({hookGroupId, hookId}, true);

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  await hook.modify((hook) => {
    hook.triggerToken = taskcluster.slugid();
  });

  return res.reply({
    token: hook.triggerToken,
  });
});

/** Trigger hook from a webhook with a token **/
api.declare({
  method:       'post',
  route:        '/hooks/:hookGroupId/:hookId/trigger/:token',
  name:         'triggerHookWithToken',
  input:        'trigger-hook.json',
  output:       'task-status.json',
  title:        'Trigger a hook with a token',
  stability:    'stable',
  description: [
    'This endpoint triggers a defined hook with a valid token.',
    '',
    'The HTTP payload must match the hook\s `triggerSchema`.  If it does, it is',
    'provided as the `payload` property of the JSON-e context used to render the',
    'task template.',
  ].join('\n'),
}, async function(req, res) {
  const payload = req.body;
  const ajv = new Ajv({format: 'full', verbose: true, allErrors: true});

  const hook = await this.Hook.load({
    hookGroupId: req.params.hookGroupId,
    hookId: req.params.hookId,
  }, true);

  // Return a 404 if the hook entity doesn't exist
  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // Return 401 if the token doesn't exist or doesn't match
  if (req.params.token !== hook.triggerToken) {
    return res.reportError('AuthenticationFailed', 'invalid hook token', {});
  }

  //Using ajv lib to check if the context respect the triggerSchema
  const validate = ajv.compile(hook.triggerSchema);

  if (validate && payload) {
    let valid = validate(payload);
    if (!valid) {
      return res.reportError('InputError', '{{message}}', {message: validate.errors[0].message});
    }
  }
  // build the context for the task creation
  let context = {
    firedBy: 'triggerHookWithToken',
    payload: payload,
  };

  let resp = await this.taskcreator.fire(hook, context);
  return res.reply(resp);
});
