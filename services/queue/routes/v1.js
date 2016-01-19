let Promise     = require('promise');
let debug       = require('debug')('routes:v1');
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
 *   publicProxies:  // Mapping from EC2 region to proxy host for publicBucket
 *   credentials:    // TaskCluster credentials for issuing temp creds on claim
 * }
 */
var api = new base.API({
  title:        "Queue API Documentation",
  description: [
    "The queue, typically available at `queue.taskcluster.net`, is responsible",
    "for accepting tasks and track their state as they are executed by",
    "workers. In order ensure they are eventually resolved.",
    "",
    "This document describes the API end-points offered by the queue. These ",
    "end-points targets the following audience:",
    " * Schedulers, who create tasks to be executed,",
    " * Workers, who execute tasks, and",
    " * Tools, that wants to inspect the state of a task."
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
  context: [
    'Task',
    'Artifact',
    'TaskGroup',
    'taskGroupExpiresExtension',
    'TaskGroupMember',
    'publicBucket',
    'privateBucket',
    'blobStore',
    'publisher',
    'validator',
    'claimTimeout',
    'queueService',
    'regionResolver',
    'publicProxies',
    'credentials',
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
  title:      "Get Task Definition",
  description: [
    "This end-point will return the task-definition. Notice that the task",
    "definition may have been modified by queue, if an optional property isn't",
    "specified the queue may provide a default value."
  ].join('\n')
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId:     req.params.taskId
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
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
  title:      "Get task status",
  description: [
    "Get task status structure from `taskId`"
  ].join('\n')
}, async function(req, res) {
  // Load Task entity
  let task = await this.Task.load({
    taskId:     req.params.taskId
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Reply with task status
  return res.reply({
    status:   task.status()
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
  title:      "List Task Group",
  description: [
    "List taskIds of all tasks sharing the same `taskGroupId`.",
    "",
    "As a task-group may contain an unbounded number of tasks, this end-point",
    "may return a `continuationToken`. To continue listing tasks you must",
    "`listTaskGroup` again with the `continuationToken` as the query-string",
    "option `continuationToken`.",
    "",
    "By default this end-point will try to return up to 1000 members in one",
    "request. But it **may return less**, even if more tasks are available.",
    "It may also return a `continuationToken` even though there are no more",
    "results. However, you can only be sure to have seen all results if you",
    "keep calling `listTaskGroup` with the last `continationToken` until you",
    "get a result without a `continuationToken`.",
    "",
    "If you're not interested in listing all the members at once, you may",
    "use the query-string option `limit` to return fewer.",
  ].join('\n')
}, async function(req, res) {
  let taskGroupId   = req.params.taskGroupId;
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000);

  let data = await this.TaskGroupMember.query({
    taskGroupId,
    expires: base.Entity.op.greaterThanOrEqual(new Date()),
  }, {continuation, limit});

  let members = data.entries.map(member => member.taskId);

  // Build result
  let result = {taskGroupId, members};
  if (data.continuation) {
    result.continuationToken = data.continuation;
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
    return {code: 400, json: {
      message:    "Created timestamp cannot be in the past (max 15min drift)",
      error:      {created: taskDef.created}
    }};
  }
  if (created.getTime() > new Date().getTime() + 15 * 60 * 1000) {
    return {code: 400, json: {
      message:    "Created timestamp cannot be in the future (max 15min drift)",
      error:      {created: taskDef.created}
    }};
  }
  if (created.getTime() > deadline.getTime()) {
    return {code: 400, json: {
      message:    "Deadline cannot be past created",
      error:      {created: taskDef.created, deadline: taskDef.deadline}
    }};
  }
  if (deadline.getTime() < new Date().getTime()) {
    return {code: 400, json: {
      message:    "Deadline cannot be in the past",
      error:      {deadline: taskDef.deadline}
    }};
  }

  var msToDeadline = (deadline.getTime() - new Date().getTime());
  // Validate that deadline is less than 5 days from now, allow 15 min drift
  if (msToDeadline > 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000) {
    return {code: 400, json: {
      message:    "Deadline cannot be more than 5 days into the future",
      error:      {deadline: taskDef.deadline}
    }};
  }

  // Set expires, if not defined
  if (!taskDef.expires) {
    var expires = new Date(taskDef.deadline);
    expires.setFullYear(expires.getFullYear() + 1);
    taskDef.expires = expires.toJSON();
  }

  // Validate that expires is past deadline
  if (deadline.getTime() > new Date(taskDef.deadline).getTime()) {
    return {code: 400, json: {
      message:    "Expires cannot be before the deadline",
      error:      {deadline: taskDef.deadline, expires: taskDef.expires}
    }};
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
  let taskGroupExpiration = new Date(
    new Date(taskDef.expires).getTime() +
    ctx.taskGroupExpiresExtension * 1000
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
    res.status(409).json({
      message: 'taskGroupId: ' + taskGroupId + ' contains tasks with ' +
               'schedulerId: ' + taskGroup.schedulerId + ' you cannot ' +
               'insert tasks into it with schedulerId: ' + taskDef.schedulerId,
      taskGroupId,
      existingSchedulerId: taskGroup.schedulerId,
      givenSchedulerId: taskDef.schedulerId,
    });
    return false;
  }
  // Update taskGroup.expires if necessary
  await taskGroup.modify(taskGroup => {
    if (taskGroup.expires.getTime() < new Date(taskDef.expires).getTime()) {
      taskGroup.expires = taskGroupExpiration;
    }
  });

  // Ensure the group membership relation is constructed too
  await ctx.TaskGroupMember.create({
    taskGroupId,
    taskId,
    expires: new Date(taskDef.expires),
  }).catch(err => {
    // If the entity already exists, then we're happy no need to crash
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
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
  title:      "Create New Task",
  description: [
    "Create a new task, this is an **idempotent** operation, so repeat it if",
    "you get an internal server error or network connection is dropped.",
    "",
    "**Task `deadline´**, the deadline property can be no more than 5 days",
    "into the future. This is to limit the amount of pending tasks not being",
    "taken care of. Ideally, you should use a much shorter deadline.",
    "",
    "**Task expiration**, the `expires` property must be greater than the",
    "task `deadline`. If not provided it will default to `deadline` + one",
    "year. Notice, that artifacts created by task must expire before the task.",
    "",
    "**Task specific routing-keys**, using the `task.routes` property you may",
    "define task specific routing-keys. If a task has a task specific ",
    "routing-key: `<route>`, then when the AMQP message about the task is",
    "published, the message will be CC'ed with the routing-key: ",
    "`route.<route>`. This is useful if you want another component to listen",
    "for completed tasks you have posted.",
    "",
    "**Important** Any scopes the task requires are also required for creating",
    "the task. Please see the Request Payload (Task Definition) for details."
  ].join('\n')
}, async function(req, res) {
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.status(detail.code).json(detail.json);
  }

  // Find scopes required for task specific routes
  var routeScopes = taskDef.routes.map(route => 'queue:route:' + route);

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if (!req.satisfies({
    taskId,
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType,
    schedulerId:    taskDef.schedulerId,
    taskGroupId:    taskDef.taskGroupId,
  }) || !req.satisfies([taskDef.scopes])
     || !req.satisfies([routeScopes])) {
    return;
  }

  // Check scopes for priority
  if (taskDef.priority !== 'normal' &&
      !req.satisfies([['queue:task-priority:' + taskDef.priority]])) {
    return;
  }

  // Ensure group membership is declared, and that schedulerId isn't conflicting
  if (!await ensureTaskGroup(this, taskId, taskDef, res)) {
    return;
  }

  // Insert entry in deadline queue
  var deadline = new Date(taskDef.deadline);
  await this.queueService.putDeadlineMessage(taskId, deadline);

  // Try to create Task entity
  try {
    var task = await this.Task.create({
      taskId:           taskId,
      provisionerId:    taskDef.provisionerId,
      workerType:       taskDef.workerType,
      schedulerId:      taskDef.schedulerId,
      taskGroupId:      taskDef.taskGroupId,
      routes:           taskDef.routes,
      priority:         taskDef.priority,
      retries:          taskDef.retries,
      retriesLeft:      taskDef.retries,
      created:          new Date(taskDef.created),
      deadline:         deadline,
      expires:          new Date(taskDef.expires),
      scopes:           taskDef.scopes,
      payload:          taskDef.payload,
      metadata:         taskDef.metadata,
      tags:             taskDef.tags,
      extra:            taskDef.extra,
      runs:             [{
        state:          'pending',
        reasonCreated:  'scheduled',
        scheduled:      new Date().toJSON()
      }],
      takenUntil:       new Date(0)
    });
  }
  catch (err) {
    // We can handle cases where entity already exists, not that, we re-throw
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // load task, and task definition
    task      = await this.Task.load({taskId: taskId});
    let def   = await task.definition();

    // Compare the two task definitions and ensure there is a at-least one run
    // otherwise the task would have been created with defineTask, and we don't
    // offer an idempotent operation in that case
    if (!_.isEqual(taskDef, def) || task.runs.length === 0) {
      return res.status(409).json({
        message:      "taskId: " + taskId + " already used by another task"
      });
    }
  }

  // Construct task status, as we'll return this many times
  var status = task.status();

  // If first run isn't pending, all message must have been published before,
  // this can happen if we came from the catch-branch (it's unlikely to happen)
  if (task.runs[0].state !== 'pending') {
    return res.reply({
      status:   status
    });
  }

  await Promise.all([
    // Put message into the task pending queue
    this.queueService.putPendingMessage(task, 0),

    // Publish pulse messages
    (async () => {
      // Publish task-defined message, we want this arriving before the
      // task-pending message, so we have to await publication here
      await this.publisher.taskDefined({
        status:         status
      }, task.routes);

      // Put message in appropriate azure queue, and publish message to pulse
      await this.publisher.taskPending({
        status:         status,
        runId:          0
      }, task.routes);
    })()
  ]);

  // Reply
  return res.reply({
    status:         status
  });
});

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/define',
  name:       'defineTask',
  stability:  base.API.stability.stable,
  scopes:     [
    // Legacy scopes
    ['queue:define-task:<provisionerId>/<workerType>'],
    ['queue:create-task:<provisionerId>/<workerType>'],
    [
    // Future scope
      'queue:define-task:<provisionerId>/<workerType>',
      'queue:task-group-id:<schedulerId>/<taskGroupId>',
    ]
  ],
  deferAuth:  true,
  input:      'create-task-request.json#',
  output:     'task-status-response.json#',
  title:      "Define Task",
  description: [
    "Define a task without scheduling it. This API end-point allows you to",
    "upload a task definition without having scheduled. The task won't be",
    "reported as pending until it is scheduled, see the scheduleTask API ",
    "end-point.",
    "",
    "The purpose of this API end-point is allow schedulers to upload task",
    "definitions without the tasks becoming _pending_ immediately. This useful",
    "if you have a set of dependent tasks. Then you can upload all the tasks",
    "and when the dependencies of a tasks have been resolved, you can schedule",
    "the task by calling `/task/:taskId/schedule`. This eliminates the need to",
    "store tasks somewhere else while waiting for dependencies to resolve.",
    "",
    "**Important** Any scopes the task requires are also required for defining",
    "the task. Please see the Request Payload (Task Definition) for details.",
    "",
    "**Note** this operation is **idempotent**, as long as you upload the same",
    "task definition as previously defined this operation is safe to retry."
  ].join('\n')
}, async function(req, res) {
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.status(detail.code).json(detail.json);
  }

  // Find scopes required for task-specific routes
  var routeScopes = taskDef.routes.map(route => 'queue:route:' + route);

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if(!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType,
    schedulerId:    taskDef.schedulerId,
    taskGroupId:    taskDef.taskGroupId,
  }) || !req.satisfies([taskDef.scopes])
     || !req.satisfies([routeScopes])) {
    return;
  }

  // Check scopes for priority
  if (taskDef.priority !== 'normal' &&
      !req.satisfies([['queue:task-priority:' + taskDef.priority]])) {
    return;
  }

  // Ensure group membership is declared, and that schedulerId isn't conflicting
  if (!await ensureTaskGroup(this, taskId, taskDef, res)) {
    return;
  }

  // Insert entry in deadline queue (garbage entries are acceptable)
  var deadline = new Date(taskDef.deadline);
  await this.queueService.putDeadlineMessage(taskId, deadline);

  // Try to create Task entity
  try {
    var task = await this.Task.create({
      taskId:           taskId,
      provisionerId:    taskDef.provisionerId,
      workerType:       taskDef.workerType,
      schedulerId:      taskDef.schedulerId,
      taskGroupId:      taskDef.taskGroupId,
      routes:           taskDef.routes,
      priority:         taskDef.priority,
      retries:          taskDef.retries,
      retriesLeft:      taskDef.retries,
      created:          new Date(taskDef.created),
      deadline:         deadline,
      expires:          new Date(taskDef.expires),
      scopes:           taskDef.scopes,
      payload:          taskDef.payload,
      metadata:         taskDef.metadata,
      tags:             taskDef.tags,
      extra:            taskDef.extra,
      runs:             [],
      takenUntil:       new Date(0)
    });
  }
  catch (err) {
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
      debug("DEFINE-FAILED: input -> %j !== %j <- existing", taskDef, def);
      return res.status(409).json({
        message:      "taskId: " + taskId + " already used by another task"
      });
    }
  }

  // Construct task status
  var status = task.status();

  // If runs are present, then we don't need to publish messages as this must
  // have happened already...
  // this can happen if we came from the catch-branch (it's unlikely to happen)
  if (task.runs.length > 0) {
    return res.reply({
      status:       status
    });
  }

  // Publish task-defined message
  await this.publisher.taskDefined({
    status:         status
  }, task.routes);

  // Reply
  return res.reply({
    status:         status
  });
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
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ], [
      'queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>',
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      "Schedule Defined Task",
  description: [
    "If you have define a task using `defineTask` API end-point, then you",
    "can schedule the task to be scheduled using this method.",
    "This will announce the task as pending and workers will be allowed, to",
    "claim it and resolved the task.",
    "",
    "**Note** this operation is **idempotent** and will not fail or complain",
    "if called with `taskId` that is already scheduled, or even resolved.",
    "To reschedule a task previously resolved, use `rerunTask`."
  ].join('\n')
}, async function(req, res) {
  // Load Task entity
  var taskId = req.params.taskId;
  var task = await this.Task.load({taskId: taskId}, true);

  // If task entity doesn't exists, we return 404
  if (!task) {
    return res.status(404).json({
      message:    "Task not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId,
  })) {
    return;
  }

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.status(409).json({
      message:    "Task can't be scheduled past it's deadline",
      error:      {deadline: task.deadline.toJSON()}
    });
  }

  // Ensure that we have an initial run
  await task.modify((task) => {
    // Don't modify if there already is a run
    if (task.runs.length > 0) {
      return;
    }

    // Add initial run (runId = 0)
    task.runs.push({
      state:          'pending',
      reasonCreated:  'scheduled',
      scheduled:      new Date().toJSON()
    });
  });

  // Construct status object
  var status = task.status();

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  if (task.runs[0].state === 'pending') {
    await Promise.all([
      this.queueService.putPendingMessage(task, 0),
      this.publisher.taskPending({
        status:         status,
        runId:          0
      }, task.routes)
    ]);
  }

  return res.reply({
    status:     status
  });
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
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ], [
      'queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>',
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      "Rerun a Resolved Task",
  description: [
    "This method _reruns_ a previously resolved task, even if it was",
    "_completed_. This is useful if your task completes unsuccessfully, and",
    "you just want to run it from scratch again. This will also reset the",
    "number of `retries` allowed.",
    "",
    "Remember that `retries` in the task status counts the number of runs that",
    "the queue have started because the worker stopped responding, for example",
    "because a spot node died.",
    "",
    "**Remark** this operation is idempotent, if you try to rerun a task that",
    "isn't either `failed` or `completed`, this operation will just return the",
    "current task status."
  ].join('\n')
}, async function(req, res) {
  // Load Task entity
  var taskId  = req.params.taskId;
  var task    = await this.Task.load({taskId: taskId}, true);

  // Report 404, if task entity doesn't exist
  if (!task) {
    return res.status(404).json({
      message:  "Task not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId
  })) {
    return;
  }

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.status(409).json({
      message:    "Task can't be scheduled past it's deadline",
      error:      {deadline: task.deadline.toJSON()}
    });
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
      scheduled:        new Date().toJSON()
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
    return res.status(409).json({
      message:    "Maximum number of runs reached"
    });
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
        runId:          runId
      }, task.routes)
    ]);
  }

  return res.reply({
    status:     status
  });
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
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ], [
      'queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>',
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     'task-status-response.json#',
  title:      "Cancel Task",
  description: [
    "This method will cancel a task that is either `unscheduled`, `pending` or",
    "`running`. It will resolve the current run as `exception` with",
    "`reasonResolved` set to `canceled`. If the task isn't scheduled yet, ie.",
    "it doesn't have any runs, an initial run will be added and resolved as",
    "described above. Hence, after canceling a task, it cannot be scheduled",
    "with `queue.scheduleTask`, but a new run can be created with",
    "`queue.rerun`. These semantics is equivalent to calling",
    "`queue.scheduleTask` immediately followed by `queue.cancelTask`.",
    "",
    "**Remark** this operation is idempotent, if you try to cancel a task that",
    "isn't `unscheduled`, `pending` or `running`, this operation will just",
    "return the current task status."
  ].join('\n')
}, async function(req, res) {
  // Load Task entity
  var taskId  = req.params.taskId;
  var task    = await this.Task.load({taskId: taskId}, true);

  // Report 404, if task entity doesn't exist
  if (!task) {
    return res.status(404).json({
      message:  "Task not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    taskId,
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId
  })) {
    return;
  }

  // Validate deadline
  if (task.deadline.getTime() < new Date().getTime()) {
    return res.status(409).json({
      message:    "Task can't be cancel task past it's deadline",
      error:      {deadline: task.deadline.toJSON()}
    });
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
        resolved:         now
      });
    }

    // Clear takenUntil
    task.takenUntil = new Date(0);
  });

  // Get the last run, there should always be one
  var run = _.last(task.runs);
  if (!run) {
    debug("[alert-operator] There should exist a run after cancelTask! " +
          " taskId: %s, status: %j", task.taskId, task.status());
  }

  // Construct status object
  var status = task.status();

  // Publish message about last run, if it was canceled
  if (run.state === 'exception' && run.reasonResolved === 'canceled') {
    var runId = task.runs.length - 1;
    await this.publisher.taskException(_.defaults({
      status:     status,
      runId:      runId
    }, _.pick(run, 'workerGroup', 'workerId')), task.routes);
  }

  return res.reply({
    status:     status
  });
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
      'assume:worker-type:<provisionerId>/<workerType>'
    ], [
      'queue:poll-task-urls:<provisionerId>/<workerType>',
    ]
  ],
  deferAuth:  true,
  output:     'poll-task-urls-response.json#',
  title:      "Get Urls to Poll Pending Tasks",
  description: [
    "Get a signed URLs to get and delete messages from azure queue.",
    "Once messages are polled from here, you can claim the referenced task",
    "with `claimTask`, and afterwards you should always delete the message."
  ].join('\n')
}, async function(req, res) {
  var provisionerId = req.params.provisionerId;
  var workerType    = req.params.workerType;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    provisionerId:  provisionerId,
    workerType:     workerType
  })) {
    return;
  }

  // Construct signedUrl for accessing the azure queue for this
  // provisionerId and workerType
  var {
    queues,
    expiry
  } = await this.queueService.signedPendingPollUrls(provisionerId, workerType);

  // Return signed URLs
  res.reply({
    queues,
    expires: expiry.toJSON()
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
      'assume:worker-id:<workerGroup>/<workerId>'
    ], [
      'queue:claim-task:<provisionerId>/<workerType>',
      'queue:worker-id:<workerGroup>/<workerId>',
    ]
  ],
  deferAuth:  true,
  input:      'task-claim-request.json#',
  output:     'task-claim-response.json#',
  title:      "Claim task",
  description: [
    "claim a task, more to be added later..."
  ].join('\n')
}, async function(req, res) {
  var taskId      = req.params.taskId;
  var runId       = parseInt(req.params.runId);

  var workerGroup = req.body.workerGroup;
  var workerId    = req.body.workerId;

  // Load Task entity
  let task = await this.Task.load({
    taskId:     taskId
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    workerGroup,
    workerId,
    provisionerId:  task.provisionerId,
    workerType:     task.workerType,
  })) {
    return;
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

  // If the run doesn't exist return 404
  if (!run) {
    return res.status(404).json({
      message: "Run not found"
    });
  }
  // If the run wasn't claimed by this workerGroup/workerId, then we return
  // 409 as it must have claimed by someone else
  if (task.runs.length - 1  !== runId ||
      run.state             !== 'running' ||
      run.workerGroup       !== workerGroup ||
      run.workerId          !== workerId) {
    return res.status(409).json({
      message:  "Run claimed by another worker"
    });
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
    takenUntil:   run.takenUntil
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
    credentials: this.credentials
  });

  // Reply to caller
  return res.reply({
    status:       status,
    runId:        runId,
    workerGroup:  workerGroup,
    workerId:     workerId,
    takenUntil:   run.takenUntil,
    task:         await task.definition(),
    credentials:  credentials
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
      'assume:worker-id:<workerGroup>/<workerId>'
    ], [
      'queue:reclaim-task:<taskId>/<runId>'
    ]
  ],
  deferAuth:  true,
  output:     'task-reclaim-response.json#',
  title:      "Reclaim task",
  description: [
    "reclaim a task more to be added later..."
  ].join('\n')
}, async function(req, res) {
  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);

  // Load Task entity
  let task = await this.Task.load({
    taskId:     taskId
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.status(404).json({
      message: "Run not found"
    });
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
    return res.status(409).json({
      message: "Task deadline exceeded"
    });
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
    return res.status(409).json({
      message: "Run is resolved, or not running"
    });
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
    credentials: this.credentials
  });

  // Reply to caller
  return res.reply({
    status:       task.status(),
    runId:        runId,
    workerGroup:  run.workerGroup,
    workerId:     run.workerId,
    takenUntil:   takenUntil.toJSON(),
    credentials:  credentials
  });
});


/**
 * Resolve a run of a task as `target` ('completed' or 'failed').
 * This function assumes the same context as the API.
 */
var resolveTask = async function(req, res, taskId, runId, target) {
  assert(target === 'completed' ||
         target === 'failed', "Expected a valid target");

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.status(404).json({
      message: "Run not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    taskId,
    runId,
    workerGroup:    run.workerGroup,
    workerId:       run.workerId
  })) {
    return;
  }

  await task.modify((task) => {
    var run = task.runs[runId];

    // No modification is, run isn't running or the run isn't last
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
    return res.status(409).json({
      message: "Run is resolved, or not running"
    });
  }

  // Construct status object
  var status = task.status();

  // Post message about task resolution
  if (target === 'completed') {
    await this.publisher.taskCompleted({
      status:       status,
      runId:        runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId
    }, task.routes);
  } else {
    await this.publisher.taskFailed({
      status:       status,
      runId:        runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId
    }, task.routes);
  }

  return res.reply({
    status:   status
  });
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
      'assume:worker-id:<workerGroup>/<workerId>'
    ], [
      'queue:resolve-task:<taskId>/<runId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     'task-status-response.json#',
  title:      "Report Run Completed",
  description: [
    "Report a task completed, resolving the run as `completed`."
  ].join('\n')
}, function(req, res) {
  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);
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
      'assume:worker-id:<workerGroup>/<workerId>'
    ], [
      'queue:resolve-task:<taskId>/<runId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     'task-status-response.json#',
  title:      "Report Run Failed",
  description: [
    "Report a run failed, resolving the run as `failed`. Use this to resolve",
    "a run that failed because the task specific code behaved unexpectedly.",
    "For example the task exited non-zero, or didn't produce expected output.",
    "",
    "Don't use this if the task couldn't be run because if malformed payload,",
    "or other unexpected condition. In these cases we have a task exception,",
    "which should be reported with `reportException`."
  ].join('\n')
}, function(req, res) {
  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);

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
      'assume:worker-id:<workerGroup>/<workerId>'
    ], [
      'queue:resolve-task:<taskId>/<runId>'
    ]
  ],
  deferAuth:  true,
  input:      'task-exception-request.json#',
  output:     'task-status-response.json#',
  title:      "Report Task Exception",
  description: [
    "Resolve a run as _exception_. Generally, you will want to report tasks as",
    "failed instead of exception. You should `reportException` if,",
    "",
    "  * The `task.payload` is invalid,",
    "  * Non-existent resources are referenced,",
    "  * Declared actions cannot be executed due to unavailable resources,",
    "  * The worker had to shutdown prematurely, or,",
    "  * The worker experienced an unknown error.",
    "",
    "Do not use this to signal that some user-specified code crashed for any",
    "reason specific to this code. If user-specific code hits a resource that",
    "is temporarily unavailable worker should report task _failed_."
  ].join('\n')
}, async function(req, res) {
  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);
  var reason        = req.body.reason;

  // Load Task entity
  let task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Handle cases where the run doesn't exist
  var run = task.runs[runId];
  if (!run) {
    return res.status(404).json({
      message: "Run not found"
    });
  }

  // Authenticate request by providing parameters
  if(!req.satisfies({
    taskId,
    runId,
    workerGroup:    run.workerGroup,
    workerId:       run.workerId
  })) {
    return;
  }

  await task.modify((task) => {
    var run = task.runs[runId];

    // No modification is, run isn't running or the run isn't last
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
        scheduled:        new Date().toJSON()
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
    return res.status(409).json({
      message: "Run is resolved, or not running"
    });
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
        runId:          runId + 1
      }, task.routes)
    ]);
  } else {
    // Publish message about taskException
    await this.publisher.taskException({
      status,
      runId,
      workerGroup:  run.workerGroup,
      workerId:     run.workerId
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
  scopes:     [['queue:pending-tasks:<provisionerId>/<workerType>']],
  deferAuth:  true,
  output:     'pending-tasks-response.json#',
  title:      "Get Number of Pending Tasks",
  description: [
    "Documented later...",
    "This probably the end-point that will remain after rewriting to azure",
    "queue storage...",
    "",
  ].join('\n')
}, async function(req, res) {
  var provisionerId = req.params.provisionerId;
  var workerType    = req.params.workerType;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    provisionerId:  provisionerId,
    workerType:     workerType
  })) {
    return;
  }

  // Get number of pending message
  var count = await this.queueService.countPendingMessages(
    provisionerId, workerType
  );

  // Reply to call with count `pendingTasks`
  return res.reply({
    provisionerId:  provisionerId,
    workerType:     workerType,
    pendingTasks:   count
  });
});


/** Check that the server is a alive */
api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  title:    "Ping Server",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {

  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});
