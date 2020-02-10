const parser = require('cron-parser');
const taskcluster = require('taskcluster-client');
const { APIBuilder } = require('taskcluster-lib-api');
const { UNIQUE_VIOLATION, paginatedIterator } = require('taskcluster-lib-postgres');
const nextDate = require('../src/nextdate');
const _ = require('lodash');
const Ajv = require('ajv');
const { hookUtils } = require('./utils');

const builder = new APIBuilder({
  title: 'Hooks Service',
  description: [
    'The hooks service provides a mechanism for creating tasks in response to events.',
    '',
  ].join('\n'),
  serviceName: 'hooks',
  apiVersion: 'v1',
  params: {
    hookGroupId: /^[a-zA-Z0-9-_]{1,64}$/,
    hookId: /^[a-zA-Z0-9-_\/]{1,64}$/,
  },
  context: ['db', 'taskcreator', 'publisher', 'denylist'],
});

module.exports = builder;

/** Get hook groups **/
builder.declare({
  method: 'get',
  route: '/hooks',
  name: 'listHookGroups',
  scopes: 'hooks:list-hooks:',
  idempotent: true,
  category: 'Hooks',
  output: 'list-hook-groups-response.yml',
  title: 'List hook groups',
  stability: 'stable',
  description: [
    'This endpoint will return a list of all hook groups with at least one hook.',
  ].join('\n'),
}, async function(req, res) {
  const groups = new Set();
  const hooks = (await this.db.fns.get_hooks(null, null, null, null)).map(hookUtils.fromDb);

  hooks.forEach(hook => {
    groups.add(hook.hookGroupId);
  });
  return res.reply({ groups: Array.from(groups) });
});

/** Get hooks in a given group **/
builder.declare({
  method: 'get',
  route: '/hooks/:hookGroupId',
  name: 'listHooks',
  scopes: 'hooks:list-hooks:<hookGroupId>',
  idempotent: true,
  category: 'Hooks',
  output: 'list-hooks-response.yml',
  title: 'List hooks in a given group',
  stability: 'stable',
  description: [
    'This endpoint will return a list of all the hook definitions within a',
    'given hook group.',
  ].join('\n'),
}, async function(req, res) {
  const hooks = (await this.db.fns.get_hooks(req.params.hookGroupId, null, null, null))
    .map(hookUtils.fromDb)
    .map(hookUtils.definition);

  if (hooks.length === 0) {
    return res.reportError('ResourceNotFound', 'No such group', {});
  }
  return res.reply({ hooks: hooks });
});

/** Get hook definition **/
builder.declare({
  method: 'get',
  route: '/hooks/:hookGroupId/:hookId',
  name: 'hook',
  scopes: 'hooks:get:<hookGroupId>:<hookId>',
  idempotent: true,
  output: 'hook-definition.yml',
  title: 'Get hook definition',
  category: 'Hooks',
  stability: 'stable',
  description: [
    'This endpoint will return the hook definition for the given `hookGroupId`',
    'and hookId.',
  ].join('\n'),
}, async function(req, res) {
  const { hookGroupId, hookId } = req.params;
  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  // Handle the case where the hook doesn't exist
  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // Reply with the hook definition
  let definition = hookUtils.definition(hook);
  return res.reply(definition);
});

/** Get hook's current status */
builder.declare({
  method: 'get',
  route: '/hooks/:hookGroupId/:hookId/status',
  name: 'getHookStatus',
  scopes: 'hooks:status:<hookGroupId>/<hookId>',
  output: 'hook-status.yml',
  title: 'Get hook status',
  stability: 'deprecated',
  category: 'Hook Status',
  description: [
    'This endpoint will return the current status of the hook.  This represents a',
    'snapshot in time and may vary from one call to the next.',
    '',
    'This method is deprecated in favor of listLastFires.',
  ].join('\n'),
}, async function(req, res) {
  const { hookGroupId, hookId } = req.params;

  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // find the latest entry in the LastFire table for this hook
  let latest = { task_create_time: new Date(1970, 1, 1) };
  const fetch = (size, offset) => this.db.fns.get_last_fires(hookGroupId, hookId, size, offset);
  for await (let item of paginatedIterator({ fetch })) {
    if (item.task_create_time > latest.task_create_time) {
      latest = item;
    }
  }

  let reply;

  if (!latest.hook_id) {
    reply = { lastFire: { result: 'no-fire' } };
  } else if (latest.result === 'success') {
    reply = {
      lastFire: {
        result: latest.result,
        taskId: latest.task_id,
        time: latest.task_create_time.toJSON(),
      },
    };
  } else {
    let error;
    // sometimes the error is JSON, but sometimes it's not (e.g., too large)
    try {
      error = JSON.parse(latest.error);
    } catch (_) {
      error = { message: latest.error };
    }
    reply = {
      lastFire: {
        result: latest.result,
        error,
        time: latest.task_create_time.toJSON(),
      },
    };
  }

  // Return a schedule only if a schedule is defined
  if (hook.schedule.length > 0) {
    reply.nextScheduledDate = hook.nextScheduledDate.toJSON();
    // Remark: nextTaskId cannot be exposed here, it's a secret.
    // If someone could predict the taskId they could use it to create a task,
    // breaking this service when it attemtps to create a task with the same id.
  }
  return res.reply(reply);
});

/** Create a hook **/
builder.declare({
  method: 'put',
  route: '/hooks/:hookGroupId/:hookId',
  name: 'createHook',
  idempotent: true,
  scopes: { AllOf:
    ['hooks:modify-hook:<hookGroupId>/<hookId>', 'assume:hook-id:<hookGroupId>/<hookId>'],
  },
  input: 'create-hook-request.yml',
  output: 'hook-definition.yml',
  title: 'Create a hook',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'This endpoint will create a new hook.',
    '',
    'The caller\'s credentials must include the role that will be used to',
    'create the task.  That role must satisfy task.scopes as well as the',
    'necessary scopes to add the task to the queue.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  const hookDef = req.body;
  const ajv = new Ajv({ format: 'full', verbose: true, allErrors: true });

  if (req.body.hookGroupId && hookGroupId !== req.body.hookGroupId) {
    return res.reportError('InputError', 'Hook Group Ids do not match', {});
  }

  if (req.body.hookId && hookId !== req.body.hookId) {
    return res.reportError('InputError', 'Hook Ids do not match', {});
  }

  hookDef.hookGroupId = hookGroupId;
  hookDef.hookId = hookId;

  await req.authorize({ hookGroupId, hookId });

  // Validate cron-parser expressions
  for (let schedElement of hookDef.schedule) {
    try {
      parser.parseExpression(schedElement);
    } catch (err) {
      return res.reportError('InputError',
        '{{message}} in {{schedElement}}', { message: err.message, schedElement });
    }
  }

  // Handle an invalid schema
  let valid = ajv.validateSchema(hookDef.triggerSchema);
  if (!valid) {

    const errors = [];

    for (let index = 0; index < ajv.errors.length; index++) {
      errors.push(' * Property ' + ajv.errors[index].dataPath + ' ' + ajv.errors[index].message);
    }

    return res.reportError('InputError', '{{message}}', {
      message: 'triggerSchema is not a valid JSON schema:\n' + errors.join('\n'),
    });
  }

  let denied = await isDeniedBinding({
    bindings: hookDef.bindings || [],
    denylist: this.denylist,
  });
  if (denied) {
    return res.reportError('InputError', '{{message}}', {
      message: 'One or more of the exchanges below have been denied access to hooks\n' + JSON.stringify(hookDef.bindings),
    });
  }

  // Try to create a Hook entity
  try {
    const hook = _.defaults({}, hookDef, {
      bindings: [],
      triggerToken: taskcluster.slugid(),
      lastFire: { result: 'no-fire' },
      nextTaskId: taskcluster.slugid(),
      nextScheduledDate: nextDate(hookDef.schedule),
    });
    await this.db.fns.create_hook(
      hook.hookGroupId,
      hook.hookId,
      hook.metadata,
      hook.task,
      JSON.stringify(hook.bindings),
      JSON.stringify(hook.schedule),
      this.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
      this.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
      hook.nextScheduledDate,
      hook.triggerSchema,
    );
  } catch (err) {
    if (!err || err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    const existingHook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

    if (!_.isEqual(hookDef, hookUtils.definition(existingHook))) {
      return res.reportError('RequestConflict',
        'hook `' + hookGroupId + '/' + hookId + '` already exists.',
        {});
    }
  }

  await this.publisher.hookCreated({ hookGroupId, hookId });

  // Reply with the hook definition
  return res.reply(hookDef);
});

/** Update hook definition**/
builder.declare({
  method: 'post',
  route: '/hooks/:hookGroupId/:hookId',
  name: 'updateHook',
  idempotent: true,
  scopes: { AllOf:
    ['hooks:modify-hook:<hookGroupId>/<hookId>', 'assume:hook-id:<hookGroupId>/<hookId>'],
  },
  input: 'create-hook-request.yml',
  output: 'hook-definition.yml',
  title: 'Update a hook',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'This endpoint will update an existing hook.  All fields except',
    '`hookGroupId` and `hookId` can be modified.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  const hookDef = req.body;
  const ajv = new Ajv({ format: 'full', verbose: true, allErrors: true });

  if (req.body.hookGroupId && hookGroupId !== req.body.hookGroupId) {
    return res.reportError('InputError', 'Hook Group Ids do not match', {});
  }

  if (req.body.hookId && hookId !== req.body.hookId) {
    return res.reportError('InputError', 'Hook Ids do not match', {});
  }

  hookDef.hookGroupId = hookGroupId;
  hookDef.hookId = hookId;

  await req.authorize({ hookGroupId, hookId });

  let hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  //Handle an invalid schema
  let valid = ajv.validateSchema(hookDef.triggerSchema);

  if (!valid) {
    const errors = [];

    for (let index = 0; index < ajv.errors.length; index++) {
      errors.push(' * Property ' + ajv.errors[index].dataPath + ' ' + ajv.errors[index].message);
    }

    return res.reportError('InputError', '{{message}}', {
      message: 'triggerSchema is not a valid JSON schema:\n' + errors.join('\n'),
    });
  }

  // Attempt to modify properties of the hook
  const schedule = hookDef.schedule ? hookDef.schedule : [];
  for (let schedElement of schedule) {
    try {
      parser.parseExpression(schedElement);
    } catch (err) {
      return res.reportError('InputError',
        '{{message}} in {{schedElement}}', { message: err.message, schedElement });
    }
  }
  hookDef.bindings = _.defaultTo(hookDef.bindings, hook.bindings);

  let denied = await isDeniedBinding({
    bindings: hookDef.bindings,
    denylist: this.denylist,
  });
  if (denied) {
    return res.reportError('InputError', '{{message}}', {
      message: 'One or more of the exchanges below have been denied access to hooks\n' + JSON.stringify(hookDef.bindings),
    });
  }

  hook = hookUtils.fromDbRows(
    await this.db.fns.update_hook(
      hook.hookGroupId, /* hook_group_id */
      hook.hookId, /* hook_id */
      hookDef.metadata, /* metadata */
      hookDef.task, /* task */
      JSON.stringify(hookDef.bindings), /* bindings */
      JSON.stringify(schedule), /* schedule */
      null, /* encrypted_trigger_token */
      this.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }), /* encrypted_next_task_id */
      nextDate(schedule), /* next_scheduled_date */
      hookDef.triggerSchema, /* trigger_schema */
    ),
  );

  let definition = hookUtils.definition(hook);
  await this.publisher.hookUpdated({ hookGroupId, hookId });

  return res.reply(definition);
});

/** Delete hook definition**/
builder.declare({
  method: 'delete',
  route: '/hooks/:hookGroupId/:hookId',
  name: 'removeHook',
  idempotent: true,
  scopes: 'hooks:modify-hook:<hookGroupId>/<hookId>',
  title: 'Delete a hook',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'This endpoint will remove a hook definition.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;

  await req.authorize({ hookGroupId, hookId });

  // Remove the resource if it exists
  await this.db.fns.delete_hook(hookGroupId, hookId);
  await this.publisher.hookDeleted({ hookGroupId, hookId });

  await this.db.fns.delete_last_fires(req.params.hookGroupId, req.params.hookId);
  return res.status(200).json({});
});

/** Trigger a hook **/
builder.declare({
  method: 'post',
  route: '/hooks/:hookGroupId/:hookId/trigger',
  name: 'triggerHook',
  scopes: 'hooks:trigger-hook:<hookGroupId>/<hookId>',
  input: 'trigger-hook.yml',
  output: 'trigger-hook-response.yml',
  title: 'Trigger a hook',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'This endpoint will trigger the creation of a task from a hook definition.',
    '',
    'The HTTP payload must match the hook\s `triggerSchema`.  If it does, it is',
    'provided as the `payload` property of the JSON-e context used to render the',
    'task template.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;

  await req.authorize({ hookGroupId, hookId });

  const payload = req.body;
  const clientId = await req.clientId();
  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }
  return triggerHookCommon.call(this, { req, res, hook, payload, clientId, firedBy: 'triggerHook' });
});

/** Get secret token for a trigger **/
builder.declare({
  method: 'get',
  route: '/hooks/:hookGroupId/:hookId/token',
  name: 'getTriggerToken',
  scopes: 'hooks:get-trigger-token:<hookGroupId>/<hookId>',
  input: undefined,
  output: 'trigger-token-response.yml',
  title: 'Get a trigger token',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'Retrieve a unique secret token for triggering the specified hook. This',
    'token can be deactivated with `resetTriggerToken`.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;
  await req.authorize({ hookGroupId, hookId });

  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  return res.reply({
    token: this.db.decrypt({ value: hook.triggerToken }).toString('utf8'),
  });
});

/** Reset a trigger token **/
builder.declare({
  method: 'post',
  route: '/hooks/:hookGroupId/:hookId/token',
  name: 'resetTriggerToken',
  scopes: 'hooks:reset-trigger-token:<hookGroupId>/<hookId>',
  input: undefined,
  output: 'trigger-token-response.yml',
  title: 'Reset a trigger token',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'Reset the token for triggering a given hook. This invalidates token that',
    'may have been issued via getTriggerToken with a new token.',
  ].join('\n'),
}, async function(req, res) {
  const hookGroupId = req.params.hookGroupId;
  const hookId = req.params.hookId;

  await req.authorize({ hookGroupId, hookId });

  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  const triggerToken = taskcluster.slugid();
  hookUtils.fromDbRows(
    await this.db.fns.update_hook(
      hook.hookGroupId, /* hook_group_id */
      hook.hookId, /* hook_id */
      null,
      null,
      null,
      null,
      this.db.encrypt({ value: Buffer.from(triggerToken, 'utf8') }), /* encrypted_trigger_token */
      null,
      null,
      null,
    ),
  );

  return res.reply({
    token: triggerToken,
  });
});

/** Trigger hook from a webhook with a token **/
builder.declare({
  method: 'post',
  route: '/hooks/:hookGroupId/:hookId/trigger/:token',
  name: 'triggerHookWithToken',
  input: 'trigger-hook.yml',
  scopes: null,
  output: 'trigger-hook-response.yml',
  title: 'Trigger a hook with a token',
  stability: 'stable',
  category: 'Hooks',
  description: [
    'This endpoint triggers a defined hook with a valid token.',
    '',
    'The HTTP payload must match the hook\s `triggerSchema`.  If it does, it is',
    'provided as the `payload` property of the JSON-e context used to render the',
    'task template.',
  ].join('\n'),
}, async function(req, res) {
  const payload = req.body;
  const { hookGroupId, hookId } = req.params;

  const hook = hookUtils.fromDbRows(await this.db.fns.get_hook(hookGroupId, hookId));

  // Return a 404 if the hook entity doesn't exist
  if (!hook) {
    return res.reportError('ResourceNotFound', 'No such hook', {});
  }

  // Return 401 if the token doesn't exist or doesn't match
  if (req.params.token !== this.db.decrypt({ value: hook.triggerToken }).toString('utf8')) {
    return res.reportError('AuthenticationFailed', 'invalid hook token', {});
  }

  return triggerHookCommon.call(this, { req, res, hook, payload, firedBy: 'triggerHookWithToken' });
});

/**
 * Common implementation of triggerHook and triggerHookWithToken
 */
const triggerHookCommon = async function({ req, res, hook, payload, clientId, firedBy }) {
  const ajv = new Ajv({ format: 'full', verbose: true, allErrors: true });
  const context = { firedBy, payload };
  if (clientId) {
    context.clientId = clientId;
  }
  let resp;
  let error;

  //Using ajv lib to check if the context respect the triggerSchema
  const validate = ajv.compile(hook.triggerSchema);

  let valid = validate(payload);
  if (!valid) {
    return res.reportError('InputError', '{{message}}', {
      message: ajv.errorsText(validate.errors, { separator: '; ' }),
    });
  }

  try {
    resp = await this.taskcreator.fire(hook, context);
    if (!resp) {
      // hook did not produce a response, so return an empty object
      return res.reply({});
    }
  } catch (err) {
    error = err;
  }

  if (resp) {
    return res.reply(resp);
  } else if (error.body && error.body.requestInfo) {
    // handle errors from createTask specially (since they are usually about scopes)
    if (error.body.requestInfo.method === 'createTask' && error.body.code === 'InsufficientScopes') {
      return res.reportError(
        'InsufficientScopes',
        `The role \`hook-id:${hook.hookGroupId}/${hook.hookId}\` does not have sufficient scopes ` +
        `to create the task:\n\n${error.body.message}`,
        { createTask: error.body.requestInfo });
    }
    return res.reportError(
      'InputError',
      'While calling {{method}}: {{code}}\n\n{{message}}', {
        code: error.body.code,
        method: error.body.requestInfo.method,
        message: error.body.message,
      });
  } else {
    return res.reportError(
      'InputError',
      'While firing hook:\n\n{{error}}',
      { error: (error || 'unknown').toString() });
  }
};

const isDeniedBinding = async ({ bindings, denylist }) => {
  for (let deny of denylist) {
    for (let binding of bindings) {
      const denyPattern = new RegExp(`^${deny}`);
      if (denyPattern.test(binding.exchange)) {
        return true;
      }
    }
  }

  return false;
};
/**
 * Get information about recent fires of a hook
*/
builder.declare({
  method: 'get',
  route: '/hooks/:hookGroupId/:hookId/last-fires',
  name: 'listLastFires',
  scopes: 'hooks:list-last-fires:<hookGroupId>/<hookId>',
  idempotent: true,
  output: 'list-lastFires-response.yml',
  title: 'Get information about recent hook fires',
  stability: 'stable',
  category: 'Hook Status',
  description: [
    'This endpoint will return information about the the last few times this hook has been',
    'fired, including whether the hook was fired successfully or not',
  ].join('\n'),
}, async function(req, res) {
  const { hookGroupId, hookId } = req.params;
  let lastFires = [];

  const fetch = (size, offset) => this.db.fns.get_last_fires(hookGroupId, hookId, size, offset);
  for await (let row of paginatedIterator({ fetch })) {
    const item = {
      hookGroupId: row.hook_group_id,
      hookId: row.hook_id,
      firedBy: row.fired_by,
      taskId: row.task_id,
      taskCreateTime: row.task_create_time.toJSON(),
      result: row.result,
      error: row.error,
    };
    lastFires.push(item);
  }

  if (lastFires.length === 0) {
    return res.reportError('ResourceNotFound', 'No such hook or never fired', {});
  }
  return res.reply({ lastFires: lastFires });
});
