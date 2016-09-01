let Promise     = require('promise');
let debug       = require('debug')('app:api');
let slugid      = require('slugid');
let assert      = require('assert');
let _           = require('lodash');
let base        = require('taskcluster-base');
let taskcluster = require('taskcluster-client');

// Maximum number runs allowed
const MAX_RUNS_ALLOWED = 50;

/**
 * **Azure Queue Invariants**
 *
 * We use azure queue storage queues for 3 purposes:
 *   A) distribution of tasks to workers,
 *   B) expiration of task-claims, and
 *   C) resolution by deadline expiration.
 *
 * Messages for the purposes of (A) are stored on queues specific the
 * _provisionerId_ and _workerType_ of the tasks. All messages in azure queues
 * are advisory. Meaning that duplicating them, or forgetting to delete them and
 * handling them twice shall not cause issues.
 *
 * That said we do need a few invariants, this comment doesn't attempt to
 * formally establish correctness. Instead we just seek to explain the
 * intuition, so others have a chance and understanding what is going on.
 *
 *  i)    For any `pending` task there is at least one message with payload
 *        `{taskId, runId}` in a _workerType_ specific queue.
 *
 *  ii)   For any `running` task there is at least one message with payload
 *        `{taskId, runId, takenUntil}` in the queue for claim expiration,
 *        such that the message becomes visible after the claim on the
 *        current run has expired.
 *
 *  iii)  For any unresolved task there is at least one message with payload
 *        `{taskId, deadline}` in the queue for deadline resolution, such that
 *        the message becomes visible after the tasks deadline has expired.
 *
 * Using invariants above it's easy to ensure (A), (B) and (C), so long as we
 * always remember that a message is only advisory. Hence, if the task mentioned
 * doesn't exist, or is already resolved, then no error is reported and no
 * action is taken.
 *
 * To avoid the case, where we ignore the only message during expiration of
 * claims (B) due to server clock drift, we shall put the `takenUntil` time
 * into the message, so we just check if it has been updated to see if the
 * message is recent. We shall employ the same trick to ensure that clock drift
 * can't cause the last deadline message to get ignored either.
 */

// Common patterns URL parameters
var SLUGID_PATTERN      = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/;
var GENERIC_ID_PATTERN  = /^[a-zA-Z0-9-_]{1,22}$/;
var RUN_ID_PATTERN      = /^[1-9]*[0-9]+$/;

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   Task:           // data.Task instance
 *   Artifact:       // data.Artifact instance
 *   publicBucket:   // bucket instance for public artifacts
 *   privateBucket:  // bucket instance for private artifacts
 *   blobStore:      // BlobStore for azure artifacts
 *   publisher:      // publisher from base.Exchanges
 *   validator:      // base.validator
 *   claimTimeout:   // Number of seconds before a claim expires
 *   queueService:   // Azure QueueService object from queueservice.js
 *   regionResolver: // Instance of EC2RegionResolver,
 *   credentials:    // TaskCluster credentials for issuing temp creds on claim
 *   dependencyTracker: // Instance of DependencyTracker
 * }
 */
var api = new base.API({
  title:        'Queue API Documentation',
  description: [
    'The queue, typically available at `queue.taskcluster.net`, is responsible',
    'for accepting tasks and track their state as they are executed by',
    'workers. In order ensure they are eventually resolved.',
    '',
    'This document describes the API end-points offered by the queue. These ',
    'end-points targets the following audience:',
    ' * Schedulers, who create tasks to be executed,',
    ' * Workers, who execute tasks, and',
    ' * Tools, that wants to inspect the state of a task.',
  ].join('\n'),
  schemaPrefix:       'http://schemas.taskcluster.net/queue/v1/',
  params: {
    taskId:           SLUGID_PATTERN,
    taskGroupId:      SLUGID_PATTERN,
    provisionerId:    GENERIC_ID_PATTERN,
    workerType:       GENERIC_ID_PATTERN,
    workerGroup:      GENERIC_ID_PATTERN,
    workerId:         GENERIC_ID_PATTERN,
    runId:            RUN_ID_PATTERN,
  },
  errorCodes: {
    // TODO: Remove this when upgrading to new taskcluster-lib-api
    InputError:       400,  // Any hand coded validation errors
  },
  context: [
    'Task',               // data.Task instance
    'Artifact',           // data.Artifact instance
    'TaskGroup',          // data.TaskGroup instance
    'taskGroupExpiresExtension', // Time delay before expiring a task-group
    'TaskGroupMember',    // data.TaskGroupMember instance
    'TaskGroupActiveSet', // data.TaskGroupMember instance (but in a different table)
    'TaskDependency',     // data.TaskDependency instance
    'publicBucket',       // bucket instance for public artifacts
    'privateBucket',      // bucket instance for private artifacts
    'blobStore',          // BlobStore for azure artifacts
    'publisher',          // publisher from base.Exchanges
    'validator',          // base.validator
    'claimTimeout',       // Number of seconds before a claim expires
    'queueService',       // Azure QueueService object from queueservice.js
    'regionResolver',     // Instance of EC2RegionResolver,
    'credentials',        // TC credentials for issuing temp creds on claim
    'dependencyTracker',  // Instance of DependencyTracker
    'monitor',            // base.monitor instance
  ],
});

// Export api
module.exports = api;

/** Get task */
api.declare({
  method:     'get',
  route:      '/task/:taskId',
  name:       'task',
  stability:  base.API.stability.stable,
  idempotent: true,
  output:     'task.json#',
  title:      'Get Task Definition',
  description: [
    'This end-point will return the task-definition. Notice that the task',
    'definition may have been modified by queue, if an optional property is',
    'not specified the queue may provide a default value.',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId:     req.params.taskId,
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '{{taskId}} does not correspond to a task that exists.',
      'Are you sure this task has already been submitted?',
    ].join('\n'), {
      taskId: req.params.taskId,
    });
  }

  // Create task definition
  let definition = await task.definition();

  return res.reply(definition);
});

/** Get task status */
api.declare({
  method:     'get',
  route:      '/task/:taskId/status',
  name:       'status',
  stability:  base.API.stability.stable,
  input:      undefined,  // No input is accepted
  output:     'task-status-response.json#',
  title:      'Get task status',
  description: [
    'Get task status structure from `taskId`',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId:     req.params.taskId,
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '{{taskId}} does not correspond to a task that exists.',
      'Are you sure this task exists?',
    ].join('\n'), {
      taskId: req.params.taskId,
    });
  }

  // Reply with task status
  return res.reply({
    status: task.status(),
  });
});

/** List taskIds by taskGroupId */
api.declare({
  method:     'get',
  route:      '/task-group/:taskGroupId/list',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name:       'listTaskGroup',
  stability:  base.API.stability.stable,
  output:     'list-task-group-response.json#',
  title:      'List Task Group',
  description: [
    'List tasks sharing the same `taskGroupId`.',
    '',
    'As a task-group may contain an unbounded number of tasks, this end-point',
    'may return a `continuationToken`. To continue listing tasks you must call',
    'the `listTaskGroup` again with the `continuationToken` as the',
    'query-string option `continuationToken`.',
    '',
    'By default this end-point will try to return up to 1000 members in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listTaskGroup` with the last `continuationToken` until you',
    'get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the members at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  let taskGroupId   = req.params.taskGroupId;
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000, 10);

  // Find taskGroup and list of members
  let [
    taskGroup,
    members,
  ] = await Promise.all([
    this.TaskGroup.load({taskGroupId}, true),
    this.TaskGroupMember.query({
      taskGroupId,
      expires: base.Entity.op.greaterThanOrEqual(new Date()),
    }, {continuation, limit}),
  ]);

  // If no taskGroup was found
  if (!taskGroup) {
    return res.reportError('ResourceNotFound',
      'No task-group with taskGroupId: {{taskGroupId}}', {
        taskGroupId,
      },
    );
  }

  // Load tasks
  let tasks = (await Promise.all(members.entries.map(member => {
    return this.Task.load({taskId: member.taskId}, true);
  }))).filter(task => {
    // Remove tasks that don't exist, this happens on creation errors
    // Remove tasks with wrong schedulerId, this shouldn't happen unless of some
    // creation errors (probably something that involves dependency errors).
    return task && task.schedulerId === taskGroup.schedulerId;
  });

  // Build result
  let result = {
    taskGroupId,
    tasks: await Promise.all(tasks.map(async (task) => {
      return {
        status: task.status(),
        task:   await task.definition(),
      };
    })),
  };
  if (members.continuation) {
    result.continuationToken = members.continuation;
  }

  return res.reply(result);
});

/** List tasks dependents */
api.declare({
  method:     'get',
  route:      '/task/:taskId/dependents',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name:       'listDependentTasks',
  stability:  base.API.stability.stable,
  output:     'list-dependent-tasks-response.json#',
  title:      'List Dependent Tasks',
  description: [
    'List tasks that depend on the given `taskId`.',
    '',
    'As many tasks from different task-groups may dependent on a single tasks,',
    'this end-point may return a `continuationToken`. To continue listing',
    'tasks you must call `listDependentTasks` again with the',
    '`continuationToken` as the query-string option `continuationToken`.',
    '',
    'By default this end-point will try to return up to 1000 tasks in one',
    'request. But it **may return less**, even if more tasks are available.',
    'It may also return a `continuationToken` even though there are no more',
    'results. However, you can only be sure to have seen all results if you',
    'keep calling `listDependentTasks` with the last `continuationToken` until',
    'you get a result without a `continuationToken`.',
    '',
    'If you are not interested in listing all the tasks at once, you may',
    'use the query-string option `limit` to return fewer.',
  ].join('\n'),
}, async function(req, res) {
  let taskId        = req.params.taskId;
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000, 10);

  // Find task and list dependents
  let [
    task,
    dependents,
  ] = await Promise.all([
    this.Task.load({taskId}, true),
    this.TaskDependency.query({
      taskId,
      expires: base.Entity.op.greaterThanOrEqual(new Date()),
    }, {continuation, limit}),
  ]);

  // Check if task exists
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: {{taskId}} was not found',
      {taskId},
    );
  }

  // Load tasks
  let tasks = (await Promise.all(dependents.entries.map(dependent => {
    return this.Task.load({taskId: dependent.dependentTaskId}, true);
  }))).filter(task => !!task);

  // Build result
  let result = {
    taskId,
    tasks: await Promise.all(tasks.map(async (task) => {
      return {
        status: task.status(),
        task:   await task.definition(),
      };
    })),
  };
  if (dependents.continuation) {
    result.continuationToken = dependents.continuation;
  }

  return res.reply(result);
});

/** Construct default values and validate dates */
var patchAndValidateTaskDef = function(taskId, taskDef) {
  // Set taskGroupId to taskId if not provided
  if (!taskDef.taskGroupId) {
    taskDef.taskGroupId = taskId;
  }

  // Ensure: created < now < deadline (with drift up to 15 min)
  var created   = new Date(taskDef.created);
  var deadline  = new Date(taskDef.deadline);
  if (created.getTime() < new Date().getTime() - 15 * 60 * 1000) {
    return {
      code:       'InputError',
      message:    'Created timestamp cannot be in the past (max 15min drift)',
      details:    {created: taskDef.created},
    };
  }
  if (created.getTime() > new Date().getTime() + 15 * 60 * 1000) {
    return {
      code:       'InputError',
      message:    'Created timestamp cannot be in the future (max 15min drift)',
      details:    {created: taskDef.created},
    };
  }
  if (created.getTime() > deadline.getTime()) {
    return {
      code:       'InputError',
      message:    'Deadline cannot be past created',
      details:    {created: taskDef.created, deadline: taskDef.deadline},
    };
  }
  if (deadline.getTime() < new Date().getTime()) {
    return {
      code:       'InputError',
      message:    'Deadline cannot be in the past',
      details:    {deadline: taskDef.deadline},
    };
  }

  var msToDeadline = deadline.getTime() - new Date().getTime();
  // Validate that deadline is less than 5 days from now, allow 15 min drift
  if (msToDeadline > 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000) {
    return {
      code:       'InputError',
      message:    'Deadline cannot be more than 5 days into the future',
      details:    {deadline: taskDef.deadline},
    };
  }

  // Set expires, if not defined
  if (!taskDef.expires) {
    var expires = new Date(taskDef.deadline);
    expires.setFullYear(expires.getFullYear() + 1);
    taskDef.expires = expires.toJSON();
  }

  // Validate that expires is past deadline
  if (deadline.getTime() > new Date(taskDef.expires).getTime()) {
    return {
      code:       'InputError',
      message:    'Expires cannot be before the deadline',
      details:    {deadline: taskDef.deadline, expires: taskDef.expires},
    };
  }

  // Ensure that date formats are encoded as we store them for idempotent
  // operations to work with date format that has more or fewer digits
  taskDef.created   = new Date(taskDef.created).toJSON();
  taskDef.deadline  = new Date(taskDef.deadline).toJSON();
  taskDef.expires   = new Date(taskDef.expires).toJSON();

  return null;
};

/** Ensure the taskGroup exists and that membership is declared */
let ensureTaskGroup = async (ctx, taskId, taskDef, res) => {
  let taskGroupId = taskDef.taskGroupId;
  let taskGroup = await ctx.TaskGroup.load({taskGroupId}, true);
  let expires = new Date(taskDef.expires);
  let taskGroupExpiration = new Date(
    expires.getTime() + ctx.taskGroupExpiresExtension * 1000
  );
  if (!taskGroup) {
    taskGroup = await ctx.TaskGroup.create({
      taskGroupId,
      schedulerId:  taskDef.schedulerId,
      expires:      taskGroupExpiration,
    }).catch(err => {
      // We only handle cases where the entity already exists
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      return ctx.TaskGroup.load({taskGroupId});
    });
  }
  if (taskGroup.schedulerId !== taskDef.schedulerId) {
    res.reportError(
      'RequestConflict', [
        'Task group {{taskGroupId}} contains tasks with',
        'schedulerId {{taskGroupSchedulerId}}. You are attempting',
        'to include tasks from schedulerId {{taskSchedulerId}},',
        'which is not permitted.',
        'All tasks in the same task-group must have the same schedulerId.',
      ].join('\n'), {
        taskGroupId,
        taskGroupSchedulerId: taskGroup.schedulerId,
        taskSchedulerId: taskDef.schedulerId,
      });
    return false;
  }
  // Update taskGroup.expires if necessary
  await taskGroup.modify(taskGroup => {
    if (taskGroup.expires.getTime() < expires.getTime()) {
      taskGroup.expires = taskGroupExpiration;
    }
  });

  // Ensure the group membership relation is constructed too
  await ctx.TaskGroupMember.create({
    taskGroupId,
    taskId,
    expires,
  }).catch(err => {
    // If the entity already exists, then we're happy no need to crash
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }
  });

  // Now we also add the task to the group size counters as well
  await ctx.TaskGroupActiveSet.create({
    taskGroupId,
    taskId,
    expires,
  }).catch(async (err) => {
    // If the entity already exists, then we're happy no need to crash
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    let active = await ctx.TaskGroupActiveSet.load({taskId, taskGroupId});

    if (!_.isEqual(new Date(active.expires), expires)) {
      return res.reportError('RequestConflict', [
        'taskId {{taskId}} already used by another task.',
        'This could be the result of faulty idempotency!',
      ].join('\n'), {
        taskId,
      });
    }
  });

  return true;
};

/** Create tasks */
api.declare({
  method:     'put',
  route:      '/task/:taskId',
  name:       'createTask',
  stability:  base.API.stability.stable,
  idempotent: true,
  scopes:     [
    [
      // Legacy scope option to be removed
      'queue:create-task:<provisionerId>/<workerType>',
    ], [
      'queue:define-task:<provisionerId>/<workerType>',
      'queue:task-group-id:<schedulerId>/<taskGroupId>',
      'queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>',
    ],
  ],
  deferAuth:  true,
  input:      'create-task-request.json#',
  output:     'task-status-response.json#',
  title:      'Create New Task',
  description: [
    'Create a new task, this is an **idempotent** operation, so repeat it if',
    'you get an internal server error or network connection is dropped.',
    '',
    '**Task `deadline´**, the deadline property can be no more than 5 days',
    'into the future. This is to limit the amount of pending tasks not being',
    'taken care of. Ideally, you should use a much shorter deadline.',
    '',
    '**Task expiration**, the `expires` property must be greater than the',
    'task `deadline`. If not provided it will default to `deadline` + one',
    'year. Notice, that artifacts created by task must expire before the task.',
    '',
    '**Task specific routing-keys**, using the `task.routes` property you may',
    'define task specific routing-keys. If a task has a task specific ',
    'routing-key: `<route>`, then when the AMQP message about the task is',
    'published, the message will be CC\'ed with the routing-key: ',
    '`route.<route>`. This is useful if you want another component to listen',
    'for completed tasks you have posted.  The caller must have scope',
    '`queue:route:<route>` for each route.',
    '',
    '**Dependencies**, any tasks referenced in `task.dependencies` must have',
    'already been created at the time of this call.',
    '',
    '**Important** Any scopes the task requires are also required for creating',
    'the task. Please see the Request Payload (Task Definition) for details.',
  ].join('\n'),
}, async function(req, res) {
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.reportError(detail.code, detail.message, detail.details);
  }

  // Extra scopes required
  let scopes = _.flatten([
    // task.scopes
    taskDef.scopes,

    // Find scopes required for task specific routes
    taskDef.routes.map(route => 'queue:route:' + route),

    // Add scope for priority if any
    taskDef.priority !== 'normal' ? [
      'queue:task-priority:' + taskDef.priority,
    ] : [],
  ]);

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if (!req.satisfies({
    taskId,
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType,
    schedulerId:    taskDef.schedulerId,
    taskGroupId:    taskDef.taskGroupId,
  }) || !req.satisfies([scopes])) {
    return;
  }

  // Ensure group membership is declared, and that schedulerId isn't conflicting
  if (!await ensureTaskGroup(this, taskId, taskDef, res)) {
    return;
  }

  // Parse timestamps
  let created = new Date(taskDef.created);
  let deadline = new Date(taskDef.deadline);
  let expires = new Date(taskDef.expires);

  // Insert entry in deadline queue
  await this.queueService.putDeadlineMessage(
    taskId,
    taskDef.taskGroupId,
    taskDef.schedulerId,
    deadline
  );

  // Try to create Task entity
  try {
    let runs = [];
    // Add run if there is no dependencies
    if (taskDef.dependencies.length === 0) {
      runs.push({
        state:            'pending',
        reasonCreated:    'scheduled',
        scheduled:        new Date().toJSON(),
      });
    }
    var task = await this.Task.create({
      taskId:             taskId,
      provisionerId:      taskDef.provisionerId,
      workerType:         taskDef.workerType,
      schedulerId:        taskDef.schedulerId,
      taskGroupId:        taskDef.taskGroupId,
      dependencies:       taskDef.dependencies,
      requires:           taskDef.requires,
      routes:             taskDef.routes,
      priority:           taskDef.priority,
      retries:            taskDef.retries,
      retriesLeft:        taskDef.retries,
      created:            created,
      deadline:           deadline,
      expires:            expires,
      scopes:             taskDef.scopes,
      payload:            taskDef.payload,
      metadata:           taskDef.metadata,
      tags:               taskDef.tags,
      extra:              taskDef.extra,
      runs:               runs,
      takenUntil:         new Date(0),
    });
  } catch (err) {
    // We can handle cases where entity already exists, not that, we re-throw
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // load task, and task definition
    task      = await this.Task.load({taskId: taskId});
    let def   = await task.definition();

    // Compare the two task definitions
    if (!_.isEqual(taskDef, def)) {
      return res.reportError('RequestConflict', [
        'taskId {{taskId}} already used by another task.',
        'This could be the result of faulty idempotency!',
        'Existing task definition was:\n ```js\n{{existingTask}}\n```',
        'This request tried to define:\n ```js\n{{taskDefinition}}\n```',
      ].join('\n'), {
        taskId,
        existingTask: def,
        taskDefinition: taskDef,
      });
    }
  }

  // Track dependencies, if not already scheduled
  if (task.state() === 'unscheduled') {
    // Track dependencies, adds a pending run if ready to run
    let err = await this.dependencyTracker.trackDependencies(task);
    // If we get an error here the task will be left in state = 'unscheduled',
    // any attempt to use the same taskId will fail. And eventually the task
    // will be resolved deadline-expired. But since createTask never returned
    // successfully...
    if (err) {
      return res.reportError('InputError', err.message, err.details);
    }
  }

  // Construct task status, as we'll return this many times
  let status = task.status();

  // If first run isn't unscheduled or pending, all message must have been
  // published before, this can happen if we came from the catch-branch
  // (it's unlikely to happen). But no need to publish messages again
  let runZeroState = (task.runs[0] || {state: 'unscheduled'}).state;
  if (runZeroState !== 'unscheduled' && runZeroState !== 'pending') {
    return res.reply({status});
  }

  // Publish task-defined message, we want this arriving before the
  // task-pending message, so we have to await publication here
  await this.publisher.taskDefined({status}, task.routes);

  // If first run is pending we publish messages about this
  if (runZeroState === 'pending') {
    await Promise.all([
      // Put message into the task pending queue
      this.queueService.putPendingMessage(task, 0),

      // Put message in appropriate azure queue, and publish message to pulse
      this.publisher.taskPending({status, runId: 0}, task.routes),
    ]);
  }

  // Reply
  return res.reply({status});
});

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/define',
  name:       'defineTask',
  stability:  base.API.stability.deprecated,
  scopes:     [
    // Legacy scopes
    ['queue:define-task:<provisionerId>/<workerType>'],
    ['queue:create-task:<provisionerId>/<workerType>'],
    [
    // Future scope
      'queue:define-task:<provisionerId>/<workerType>',
      'queue:task-group-id:<schedulerId>/<taskGroupId>',
    ],
  ],
  deferAuth:  true,
  input:      'create-task-request.json#',
  output:     'task-status-response.json#',
  title:      'Define Task',
  description: [
    'Define a task without scheduling it. This API end-point allows you to',
    'upload a task definition without having scheduled. The task won\'t be',
    'reported as pending until it is scheduled, see the scheduleTask API ',
    'end-point.',
    '',
    'The purpose of this API end-point is allow schedulers to upload task',
    'definitions without the tasks becoming _pending_ immediately. This useful',
    'if you have a set of dependent tasks. Then you can upload all the tasks',
    'and when the dependencies of a tasks have been resolved, you can schedule',
    'the task by calling `/task/:taskId/schedule`. This eliminates the need to',
    'store tasks somewhere else while waiting for dependencies to resolve.',
    '',
    '**Important** Any scopes the task requires are also required for defining',
    'the task. Please see the Request Payload (Task Definition) for details.',
    '',
    '**Note** this operation is **idempotent**, as long as you upload the same',
    'task definition as previously defined this operation is safe to retry.',
  ].join('\n'),
}, async function(req, res) {
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.reportError(detail.code, detail.message, detail.details);
  }

  // Extra scopes required
  let scopes = _.flatten([
    // task.scopes
    taskDef.scopes,

    // Find scopes required for task specific routes
    taskDef.routes.map(route => 'queue:route:' + route),

    // Add scope for priority if any
    taskDef.priority !== 'normal' ? [
      'queue:task-priority:' + taskDef.priority,
    ] : [],
  ]);

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if (!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType,
    schedulerId:    taskDef.schedulerId,
    taskGroupId:    taskDef.taskGroupId,
  }) || !req.satisfies([scopes])) {
    return;
  }

  // Ensure we have a self-dependency, this is how defineTask works now
  if (!_.includes(taskDef.dependencies, taskId)) {
    // Trick as taskDef.dependencies may be a default from schema validation
    // HACK: Yes, schema validator really should clone its default values!
    taskDef.dependencies = _.flatten([taskId, taskDef.dependencies]);
  }

  // Ensure group membership is declared, and that schedulerId isn't conflicting
  if (!await ensureTaskGroup(this, taskId, taskDef, res)) {
    return;
  }

  // Parse timestamps
  let created = new Date(taskDef.created);
  let deadline = new Date(taskDef.deadline);
  let expires = new Date(taskDef.expires);

  // Insert entry in deadline queue (garbage entries are acceptable)
  await this.queueService.putDeadlineMessage(
    taskId,
    taskDef.taskGroupId,
    taskDef.schedulerId,
    deadline
  );

  // Try to create Task entity
  try {
    var task = await this.Task.create({
      taskId:             taskId,
      provisionerId:      taskDef.provisionerId,
      workerType:         taskDef.workerType,
      schedulerId:        taskDef.schedulerId,
      taskGroupId:        taskDef.taskGroupId,
      dependencies:       taskDef.dependencies,
      requires:           taskDef.requires,
      routes:             taskDef.routes,
      priority:           taskDef.priority,
      retries:            taskDef.retries,
      retriesLeft:        taskDef.retries,
      created:            created,
      deadline:           deadline,
      expires:            expires,
      scopes:             taskDef.scopes,
      payload:            taskDef.payload,
      metadata:           taskDef.metadata,
      tags:               taskDef.tags,
      extra:              taskDef.extra,
      runs:               [],
      takenUntil:         new Date(0),
    });
  } catch (err) {
    // We can handle cases where entity already exists, not that, we re-throw
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // load task, and task definition
    task     = await this.Task.load({taskId: taskId});
    let def  = await task.definition();

    // Compare the two task definitions
    // (ignore runs as this method don't create them)
    if (!_.isEqual(taskDef, def)) {
      return res.reportError('RequestConflict', [
        'taskId {{taskId}} already used by another task.',
        'This could be the result of faulty idempotency!',
        'Existing task definition was:\n ```js\n{{existingTask}}\n```',
        'This request tried to define:\n ```js\n{{taskDefinition}}\n```',
      ].join('\n'), {
        taskId,
        existingTask: def,
        taskDefinition: taskDef,
      });
    }
  }

  // Track dependencies, if not already scheduled
  if (task.state() === 'unscheduled') {
    // Track dependencies, adds a pending run if ready to run
    let err = await this.dependencyTracker.trackDependencies(task);
    // We get an error here the task will be left in state = 'unscheduled',
    // any attempt to use the same taskId will fail. And eventually the task
    // will be resolved deadline-expired. But since createTask never returned
    // successfully...
    if (err) {
      return res.reportError('InputError', err.message, err.details);
    }

    // Validate sanity...
    assert(task.state() === 'unscheduled', 'task should be unscheduled here!');
  }

  // Construct task status
  let status = task.status();

  // If runs are present, then we don't need to publish messages as this must
  // have happened already...
  // this can happen if we came from the catch-branch (it's unlikely to happen)
  if (task.runs.length > 0) {
    return res.reply({status});
  }

  // Publish task-defined message
  await this.publisher.taskDefined({status}, task.routes);

  // Reply
  return res.reply({status});
});

/** Schedule previously defined tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/schedule',
  name:       'scheduleTask',
  stability:  base.API.stability.stable,
  scopes:     [
    [
      // Legacy scope
      'queue:schedule-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ], [
      'queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>',
    ],
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      'Schedule Defined Task',
  description: [
    'scheduleTask will schedule a task to be executed, even if it has',
    'unresolved dependencies. A task would otherwise only be scheduled if',
    'its dependencies were resolved.',
    '',
    'This is useful if you have defined a task that depends on itself or on',
    'some other task that has not been resolved, but you wish the task to be',
    'scheduled immediately.',
    '',
    'This will announce the task as pending and workers will be allowed to',
    'claim it and resolve the task.',
    '',
    '**Note** this operation is **idempotent** and will not fail or complain',
    'if called with a `taskId` that is already scheduled, or even resolved.',
    'To reschedule a task previously resolved, use `rerunTask`.',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  var taskId = req.params.taskId;
  var task = await this.Task.load({taskId: taskId}, true);

  // If task entity doesn't exists, we return ResourceNotFound
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'taskId {{taskId}} not found. Are you sure it exists?',
      {taskId},
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId,
  })) {
    return;
  }

  // Attempt to schedule task
  let status = await this.dependencyTracker.scheduleTask(task);

  // If null it must because deadline is exceeded
  if (status === null) {
    return res.reportError(
      'RequestConflict',
      'Task {{taskId}} Can\'t be scheduled past its deadline at ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      }
    );
  }

  return res.reply({status});
});

/** Rerun a previously resolved task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/rerun',
  name:       'rerunTask',
  stability:  base.API.stability.deprecated,
  scopes:     [
    [
      // Legacy scopes
      'queue:rerun-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ], [
      'queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>',
    ],
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      'Rerun a Resolved Task',
  description: [
    'This method _reruns_ a previously resolved task, even if it was',
    '_completed_. This is useful if your task completes unsuccessfully, and',
    'you just want to run it from scratch again. This will also reset the',
    'number of `retries` allowed.',
    '',
    'Remember that `retries` in the task status counts the number of runs that',
    'the queue have started because the worker stopped responding, for example',
    'because a spot node died.',
    '',
    '**Remark** this operation is idempotent, if you try to rerun a task that',
    'is not either `failed` or `completed`, this operation will just return',
    'the current task status.',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  var taskId  = req.params.taskId;
  var task    = await this.Task.load({taskId: taskId}, true);

  // Report ResourceNotFound, if task entity doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound', [
      '{{taskId}} does not correspond to a task that exists.',
      'Are you sure this task has been submitted before?',
    ].join('\n'), {
      taskId,
    });
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId,
  })) {
    return;
  }

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.reportError(
      'RequestConflict',
      'Task {{taskId}} Can\'t be rescheduled past it\'s deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Ensure that we have a pending or running run
  // If creating a new one, then reset retriesLeft
  await task.modify((task) => {
    // Don't modify if there already is an active run
    var state = (_.last(task.runs) || {state: 'unscheduled'}).state;
    if (state === 'pending' || state === 'running') {
      return;
    }

    // Don't create more than MAX_RUNS_ALLOWED runs
    if (task.runs.length >= MAX_RUNS_ALLOWED) {
      return;
    }

    // Add a new run
    task.runs.push({
      state:            'pending',
      reasonCreated:    'rerun',
      scheduled:        new Date().toJSON(),
    });

    // Calculate maximum number of retries allowed
    var allowedRetries  = MAX_RUNS_ALLOWED - task.runs.length;

    // Reset retries left
    task.retriesLeft    = Math.min(task.retries, allowedRetries);
    task.takenUntil     = new Date(0);
  });

  var state = task.state();

  // If not running or pending, and we couldn't create more runs then we have
  // a conflict
  if (state !== 'pending' && state !== 'running' &&
      task.runs.length >= MAX_RUNS_ALLOWED) {
    return res.reportError(
      'RequestConflict',
      'Maximum number of runs reached. ({{max_runs_allowed}})', {
        max_runs_allowed: MAX_RUNS_ALLOWED,
      },
    );
  }

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  var status = task.status();
  if (state === 'pending') {
    var runId = task.runs.length - 1;
    await Promise.all([
      this.queueService.putPendingMessage(task, runId),
      this.publisher.taskPending({
        status:         status,
        runId:          runId,
      }, task.routes),
    ]);
  }

  return res.reply({status});
});

/** Cancel a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/cancel',
  name:       'cancelTask',
  stability:  base.API.stability.stable,
  scopes:     [
    [
      // Legacy scopes
      'queue:cancel-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>',
    ], [
      'queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>',
    ],
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      'Cancel Task',
  description: [
    'This method will cancel a task that is either `unscheduled`, `pending` or',
    '`running`. It will resolve the current run as `exception` with',
    '`reasonResolved` set to `canceled`. If the task isn\'t scheduled yet, ie.',
    'it doesn\'t have any runs, an initial run will be added and resolved as',
    'described above. Hence, after canceling a task, it cannot be scheduled',
    'with `queue.scheduleTask`, but a new run can be created with',
    '`queue.rerun`. These semantics is equivalent to calling',
    '`queue.scheduleTask` immediately followed by `queue.cancelTask`.',
    '',
    '**Remark** this operation is idempotent, if you try to cancel a task that',
    'isn\'t `unscheduled`, `pending` or `running`, this operation will just',
    'return the current task status.',
  ].join('\n'),
}, async function(req, res) {
  // Load Task entity
  var taskId  = req.params.taskId;
  var task    = await this.Task.load({taskId}, true);

  // Report ResourceNotFound, if task entity doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task {{taskId}} not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId,
  })) {
    return;
  }

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.reportError(
      'RequestConflict',
      'Task {{taskId}} Can\'t be canceled past it\'s deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Modify the task
  await task.modify(async (task) => {
    var run   = _.last(task.runs);
    var state = (run || {state: 'unscheduled'}).state;

    // If we have a pending task or running task, we cancel the ongoing run
    if (state === 'pending' || state === 'running') {
      run.state           = 'exception';
      run.reasonResolved  = 'canceled';
      run.resolved        = new Date().toJSON();
    }

    // If the task wasn't scheduled, we'll add a run and resolved it canceled.
    // This is almost equivalent to calling scheduleTask and cancelTask, but
    // instead of setting `reasonCreated` to 'scheduled', we set it 'exception',
    // because this run was made solely to communicate an exception.
    if (state === 'unscheduled') {
      var now = new Date().toJSON();
      task.runs.push({
        state:            'exception',
        reasonCreated:    'exception',
        reasonResolved:   'canceled',
        scheduled:        now,
        resolved:         now,
      });
    }

    // Clear takenUntil
    task.takenUntil = new Date(0);
  });

  // Get the last run, there should always be one
  var run = _.last(task.runs);
  if (!run) {
    let err = new Error('There should exist a run after cancelTask!');
    err.taskId = task.taskId;
    err.status = task.status();
    this.monitor.reportError(err);
  }

  // Construct status object
  var status = task.status();

  // If the last run was canceled, resolve dependencies and publish message
  if (run.state === 'exception' && run.reasonResolved === 'canceled') {
    // Update dependency tracker
    await this.queueService.putResolvedMessage(
      taskId,
      task.taskGroupId,
      task.schedulerId,
      'exception'
    );

    // Publish message about the exception
    await this.publisher.taskException(_.defaults({
      status,
      runId: task.runs.length - 1,
    }, _.pick(run, 'workerGroup', 'workerId')), task.routes);
  }

  return res.reply({status});
});

/** Poll for a task */
api.declare({
  method:     'get',
  route:      '/poll-task-url/:provisionerId/:workerType',
  name:       'pollTaskUrls',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy scopes
      'queue:poll-task-urls',
      'assume:worker-type:<provisionerId>/<workerType>',
    ], [
      'queue:poll-task-urls:<provisionerId>/<workerType>',
    ],
  ],
  deferAuth:  true,
  output:     'poll-task-urls-response.json#',
  title:      'Get Urls to Poll Pending Tasks',
  description: [
    'Get a signed URLs to get and delete messages from azure queue.',
    'Once messages are polled from here, you can claim the referenced task',
    'with `claimTask`, and afterwards you should always delete the message.',
  ].join('\n'),
}, async function(req, res) {
  var provisionerId = req.params.provisionerId;
  var workerType    = req.params.workerType;

  // Authenticate request by providing parameters
  if (!req.satisfies({
    provisionerId,
    workerType,
  })) {
    return;
  }

  // Construct signedUrl for accessing the azure queue for this
  // provisionerId and workerType
  var {
    queues,
    expiry,
  } = await this.queueService.signedPendingPollUrls(provisionerId, workerType);

  // Return signed URLs
  res.reply({
    queues,
    expires: expiry.toJSON(),
  });
});

/** Claim a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/claim',
  name:       'claimTask',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy
      'queue:claim-task',
      'assume:worker-type:<provisionerId>/<workerType>',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:claim-task:<provisionerId>/<workerType>',
      'queue:worker-id:<workerGroup>/<workerId>',
    ],
  ],
  deferAuth:  true,
  input:      'task-claim-request.json#',
  output:     'task-claim-response.json#',
  title:      'Claim task',
  description: [
    'claim a task, more to be added later...',
  ].join('\n'),
}, async function(req, res) {
  var taskId      = req.params.taskId;
  var runId       = parseInt(req.params.runId, 10);

  var workerGroup = req.body.workerGroup;
  var workerId    = req.body.workerId;

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task {{taskId}} not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    workerGroup,
    workerId,
    provisionerId:  task.provisionerId,
    workerType:     task.workerType,
  })) {
    return;
  }
  
  // Check if task is past deadline
  if (task.deadline.getTime() <= Date.now()) {
    return res.reportError(
      'RequestConflict',
      'Task {{taskId}} Can\'t be claimed past it\'s deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Set takenUntil to now + claimTimeout
  var takenUntil = new Date();
  takenUntil.setSeconds(takenUntil.getSeconds() + this.claimTimeout);

  var msgPut = false;
  await task.modify(async (task) => {
    var run = task.runs[runId];

    // No modifications required if there is no run, or the run isn't pending
    if (task.runs.length - 1 !== runId || run.state !== 'pending') {
      return;
    }

    // Put claim-expiration message in queue, if not already done, remember
    // that the modifier given to task.modify may be called more than once!
    if (!msgPut) {
      await this.queueService.putClaimMessage(taskId, runId, takenUntil);
      msgPut = true;
    }

    // Change state of the run (claiming it)
    run.state         = 'running';
    run.workerGroup   = workerGroup;
    run.workerId      = workerId;
    run.takenUntil    = takenUntil.toJSON();
    run.started       = new Date().toJSON();

    // Set takenUntil on the task
    task.takenUntil   = takenUntil;
  });

  // Find run that we (may) have modified
  var run = task.runs[runId];

  // If the run doesn't exist return ResourceNotFound
  if (!run) {
    return res.reportError(
      'ResourceNotFound',
      'Run {{runId}} not found on task {{taskId}}.', {
        taskId,
        runId,
      },
    );
  }
  // If the run wasn't claimed by this workerGroup/workerId, then we return
  // RequestConflict as it must have claimed by someone else
  if (task.runs.length - 1  !== runId ||
      run.state             !== 'running' ||
      run.workerGroup       !== workerGroup ||
      run.workerId          !== workerId) {
    return res.reportError(
      'RequestConflict',
      'Run {{runId}} was already claimed by another worker.', {
        runId,
      },
    );
  }

  // Construct status object
  var status = task.status();

  // Publish task running message, it's important that we publish even if this
  // is a retry request and we didn't make any changes in task.modify
  await this.publisher.taskRunning({
    status:       status,
    runId:        runId,
    workerGroup:  workerGroup,
    workerId:     workerId,
    takenUntil:   run.takenUntil,
  }, task.routes);

  // Create temporary credentials for the task
  let credentials = taskcluster.createTemporaryCredentials({
    start:  new Date(Date.now() - 15 * 60 * 1000),
    expiry: new Date(takenUntil.getTime() + 15 * 60 * 1000),
    scopes: [
      'queue:reclaim-task:' + taskId + '/' + runId,
      'queue:resolve-task:' + taskId + '/' + runId,
      'queue:create-artifact:' + taskId + '/' + runId,
    ].concat(task.scopes),
    credentials: this.credentials,
  });

  // Reply to caller
  return res.reply({
    status:       status,
    runId:        runId,
    workerGroup:  workerGroup,
    workerId:     workerId,
    takenUntil:   run.takenUntil,
    task:         await task.definition(),
    credentials:  credentials,
  });
});

/** Reclaim a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/reclaim',
  name:       'reclaimTask',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy
      'queue:claim-task',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:reclaim-task:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  output:     'task-reclaim-response.json#',
  title:      'Reclaim task',
  description: [
    'reclaim a task more to be added later...',
  ].join('\n'),
}, async function(req, res) {
  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId, 10);

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'Task {{taskId}} not found. Are you sure it was created?', {
        taskId,
      }
    );
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.reportError(
      'ResourceNotFound',
      'Run {{runId}} not found on task {{taskId}}.', {
        taskId,
        runId,
      }
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    runId,
    workerGroup:    run.workerGroup,
    workerId:       run.workerId,
  })) {
    return;
  }

  // Check if task is past deadline
  if (task.deadline.getTime() <= Date.now()) {
    return res.reportError(
      'RequestConflict',
      'Task {{taskId}} Can\'t be reclaimed past it\'s deadline of ' +
      '{{deadline}}.', {
        taskId,
        deadline: task.deadline.toJSON(),
      },
    );
  }

  // Set takenUntil to now + claimTimeout
  var takenUntil = new Date();
  takenUntil.setSeconds(takenUntil.getSeconds() + this.claimTimeout);

  var msgPut = false;
  await task.modify(async (task) => {
    var run = task.runs[runId];

    // No modifications required if there is no run or run isn't running
    if (task.runs.length - 1 !== runId || run.state !== 'running') {
      return;
    }

    // Don't update takenUntil if it's further into the future than the one
    // we're proposing
    if (new Date(run.takenUntil).getTime() >= takenUntil.getTime()) {
      return;
    }

    // Put claim-expiration message in queue, if not already done, remember
    // that the modifier given to task.modify may be called more than once!
    if (!msgPut) {
      await this.queueService.putClaimMessage(taskId, runId, takenUntil);
      msgPut = true;
    }

    // Update takenUntil
    run.takenUntil  = takenUntil.toJSON();
    task.takenUntil = takenUntil;
  });

  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't running we had a conflict
  if (task.runs.length - 1 !== runId || run.state !== 'running') {
    return res.reportError(
      'RequestConflict',
      'Run {{runId}} on task {{taskId}} is resolved or not running.', {
        taskId,
        runId,
      }
    );
  }

  // Create temporary credentials for the task
  let credentials = taskcluster.createTemporaryCredentials({
    start:  new Date(Date.now() - 15 * 60 * 1000),
    expiry: new Date(takenUntil.getTime() + 15 * 60 * 1000),
    scopes: [
      'queue:reclaim-task:' + taskId + '/' + runId,
      'queue:resolve-task:' + taskId + '/' + runId,
      'queue:create-artifact:' + taskId + '/' + runId,
    ].concat(task.scopes),
    credentials: this.credentials,
  });

  // Reply to caller
  return res.reply({
    status:       task.status(),
    runId:        runId,
    workerGroup:  run.workerGroup,
    workerId:     run.workerId,
    takenUntil:   takenUntil.toJSON(),
    credentials:  credentials,
  });
});

/**
 * Resolve a run of a task as `target` ('completed' or 'failed').
 * This function assumes the same context as the API.
 */
var resolveTask = async function(req, res, taskId, runId, target) {
  assert(target === 'completed' ||
         target === 'failed', 'Expected a valid target');

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task {{taskId}} not found. Are you sure it was created?', {
        taskId,
      },
    );
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.reportError('ResourceNotFound',
      'Run {{runId}} not found on task {{taskId}}.', {
        taskId,
        runId,
      },
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    runId,
    workerGroup:    run.workerGroup,
    workerId:       run.workerId,
  })) {
    return;
  }

  await task.modify((task) => {
    var run = task.runs[runId];

    // No modification if run isn't running or the run isn't last
    if (task.runs.length - 1 !== runId || run.state !== 'running') {
      return;
    }

    // Update run
    run.state           = target;               // completed or failed
    run.reasonResolved  = target;               // completed or failed
    run.resolved        = new Date().toJSON();

    // Clear takenUntil on task
    task.takenUntil     = new Date(0);
  });
  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't resolved to target, we had a conflict
  if (task.runs.length - 1  !== runId ||
      run.state             !== target ||
      run.reasonResolved    !== target) {
    return res.reportError('RequestConflict',
      'Run {{runId}} on task {{taskId}} is resolved or not running.', {
        taskId,
        runId,
      },
    );
  }

  // Update dependency tracker
  await this.queueService.putResolvedMessage(
    taskId,
    task.taskGroupId,
    task.schedulerId,
    target
  );

  // Construct status object
  var status = task.status();

  // Post message about task resolution
  if (target === 'completed') {
    await this.publisher.taskCompleted({
      status,
      runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId,
    }, task.routes);
  } else {
    await this.publisher.taskFailed({
      status,
      runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId,
    }, task.routes);
  }

  return res.reply({status});
};

/** Report task completed */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/completed',
  name:       'reportCompleted',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:resolve-task:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     'task-status-response.json#',
  title:      'Report Run Completed',
  description: [
    'Report a task completed, resolving the run as `completed`.',
  ].join('\n'),
}, function(req, res) {
  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId, 10);
  // Backwards compatibility with very old workers, should be dropped in the
  // future
  var target = req.body.success === false ? 'failed' : 'completed';

  return resolveTask.call(this, req, res, taskId, runId, target);
});

/** Report task failed */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/failed',
  name:       'reportFailed',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:resolve-task:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     'task-status-response.json#',
  title:      'Report Run Failed',
  description: [
    'Report a run failed, resolving the run as `failed`. Use this to resolve',
    'a run that failed because the task specific code behaved unexpectedly.',
    'For example the task exited non-zero, or didn\'t produce expected output.',
    '',
    'Do not use this if the task couldn\'t be run because if malformed',
    'payload, or other unexpected condition. In these cases we have a task',
    'exception, which should be reported with `reportException`.',
  ].join('\n'),
}, function(req, res) {
  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId, 10);

  return resolveTask.call(this, req, res, taskId, runId, 'failed');
});

/** Report task exception */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/exception',
  name:       'reportException',
  stability:  base.API.stability.stable,
  scopes: [
    [
      // Legacy
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:resolve-task:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  input:      'task-exception-request.json#',
  output:     'task-status-response.json#',
  title:      'Report Task Exception',
  description: [
    'Resolve a run as _exception_. Generally, you will want to report tasks as',
    'failed instead of exception. You should `reportException` if,',
    '',
    '  * The `task.payload` is invalid,',
    '  * Non-existent resources are referenced,',
    '  * Declared actions cannot be executed due to unavailable resources,',
    '  * The worker had to shutdown prematurely, or,',
    '  * The worker experienced an unknown error.',
    '',
    'Do not use this to signal that some user-specified code crashed for any',
    'reason specific to this code. If user-specific code hits a resource that',
    'is temporarily unavailable worker should report task _failed_.',
  ].join('\n'),
}, async function(req, res) {
  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId, 10);
  var reason        = req.body.reason;

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('ResourceNotFound',
      'Task {{taskId}} not found. Are you sure it exists?', {
        taskId,
      },
    );
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.reportError(
      'ResourceNotFound',
      'Run {{runId}} not found on task {{taskId}}.', {
        taskId,
        runId,
      },
    );
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    runId,
    workerGroup:    run.workerGroup,
    workerId:       run.workerId,
  })) {
    return;
  }

  await task.modify((task) => {
    var run = task.runs[runId];

    // No modification if run isn't running or the run isn't last
    if (task.runs.length - 1 !== runId || run.state !== 'running') {
      return;
    }

    // Update run
    run.state           = 'exception';
    run.reasonResolved  = reason;
    run.resolved        = new Date().toJSON();

    // Clear takenUntil on task
    task.takenUntil     = new Date(0);

    // Add retry, if this is a worker-shutdown and we have retries left
    if (reason === 'worker-shutdown' && task.retriesLeft > 0) {
      task.retriesLeft -= 1;
      task.runs.push({
        state:            'pending',
        reasonCreated:    'retry',
        scheduled:        new Date().toJSON(),
      });
    }
  });

  // Find the run that we (may) have modified
  run = task.runs[runId];

  // If run isn't resolved to exception with reason, we had a conflict
  if (!run ||
      task.runs.length - 1  > runId + 1 ||
      run.state             !== 'exception' ||
      run.reasonResolved    !== reason) {
    return res.reportError('RequestConflict',
      'Run {{runId}} on task {{taskId}} is resolved or not running.', {
        taskId,
        runId,
      },
    );
  }

  var status = task.status();

  // If a newRun was created and it is a retry with state pending then we better
  // publish messages about it. And if we're not retrying the task, because then
  // the task is resolved as it has no more runs, and we publish a message about
  // task-exception.
  var newRun = task.runs[runId + 1];
  if (newRun &&
      task.runs.length - 1  === runId + 1 &&
      newRun.state          === 'pending' &&
      newRun.reasonCreated  === 'retry') {
    await Promise.all([
      this.queueService.putPendingMessage(task, runId + 1),
      this.publisher.taskPending({
        status,
        runId:          runId + 1,
      }, task.routes),
    ]);
  } else {
    // Update dependency tracker, as the task is resolved (no new run)
    await this.queueService.putResolvedMessage(
      taskId,
      task.taskGroupId,
      task.schedulerId,
      'exception'
    );

    // Publish message about taskException
    await this.publisher.taskException({
      status,
      runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId,
    }, task.routes);
  }

  // Reply to caller
  return res.reply({status});
});

// Load artifacts.js so API end-points declared in that file is loaded
require('./artifacts');

/** Count pending tasks for workerType */
api.declare({
  method:     'get',
  route:      '/pending/:provisionerId/:workerType',
  name:       'pendingTasks',
  stability:  base.API.stability.stable,
  output:     'pending-tasks-response.json#',
  title:      'Get Number of Pending Tasks',
  description: [
    'Get an approximate number of pending tasks for the given `provisionerId`',
    'and `workerType`.',
    '',
    'The underlying Azure Storage Queues only promises to give us an estimate.',
    'Furthermore, we cache the result in memory for 20 seconds. So consumers',
    'should be no means expect this to be an accurate number.',
    'It is, however, a solid estimate of the number of pending tasks.',
  ].join('\n'),
}, async function(req, res) {
  var provisionerId = req.params.provisionerId;
  var workerType    = req.params.workerType;

  // Get number of pending message
  var count = await this.queueService.countPendingMessages(
    provisionerId, workerType,
  );

  // Reply to call with count `pendingTasks`
  return res.reply({
    provisionerId:  provisionerId,
    workerType:     workerType,
    pendingTasks:   count,
  });
});

/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    'Ping Server',
  description: [
    'Documented later...',
    '',
    '**Warning** this api end-point is **not stable**.',
  ].join('\n'),
}, function(req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime(),
  });
});
