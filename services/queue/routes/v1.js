var Promise   = require('promise');
var debug     = require('debug')('routes:api:v1');
var slugid    = require('slugid');
var assert    = require('assert');
var _         = require('lodash');
var base      = require('taskcluster-base');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/queue/v1/';

/** API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   Task:           // data.Task instance
 *   Artifacts:      // data.Task instance
 *   publisher:      // publisher from base.Exchanges
 *   validator:      // base.validator
 *   claimTimeout:   // Number of seconds before a claim expires
 *   queueService:   // Azure QueueService object from queueservice.js
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
  ].join('\n')
});

// List of slugid parameters
var SLUGID_PARAMS = [
  'taskId'
];

// List of identifier parameters
var IDENTIFIER_PARAMS = [
  'provisionerId',
  'workerType',
  'workerGroup',
  'workerId'
];

// List of integer parameters
var INT_PARAMS = [
  'runId'
];

/**
 * Check parameters against regular expressions for identifiers
 * and send a 401 response with an error in case of malformed URL parameters
 *
 * returns true if there was no errors.
 */
var checkParams = function(req, res) {
  var errors = [];
  _.forIn(req.params, function(value, key) {
    // Validate slugid parameters
    if (SLUGID_PARAMS.indexOf(key) !== -1) {
      if (!/^[a-zA-Z0-9-_]{22}$/.test(value)) {
        errors.push({
          message:  "Parameter '" + key + "' is not a slugid",
          error:    value
        });
      }
    }

    // Validate identifier parameters
    if (IDENTIFIER_PARAMS.indexOf(key) !== -1) {
      // Validate format
      if (!/^[a-zA-Z0-9-_]*$/.test(value)) {
        errors.push({
          message:  "Parameter '" + key + "' does not match [a-zA-Z0-9-_]* " +
                    "as required for identifiers",
          error:    value
        });
      }

      // Validate minimum length
      if (value.length == 0) {
        errors.push({
          message:  "Parameter '" + key + "' must be longer than 0 characters",
          error:    value
        });
      }

      // Validate maximum length
      if (value.length > 22) {
        errors.push({
          message:  "Parameter '" + key + "' cannot be more than 22 characters",
          error:    value
        });
      }
    }

    // Validate and parse integer parameters
    if (INT_PARAMS.indexOf(key) !== -1) {
      if (!/^[0-9]+$/.test(value)) {
        errors.push({
          message:  "Parameter '" + key + "' does not match [0-9]+",
          error:    value
        });
      } else {
        var number = parseInt(value);
        if (_.isNaN(number)) {
          errors.push({
            message:  "Parameter '" + key + "' parses to NaN",
            error:    value
          });
        }
      }
    }
  });

  // Check for errors and reply if necessary
  if (errors.length != 0) {
    res.status(401).json({
      message:  "Malformed URL parameters",
      error:    errors
    });
    return false;
  }
  // No errors
  return true;
};

// Export checkParams for use in artifacts.js
api.checkParams = checkParams;

// Export api
module.exports = api;

/** Get task */
api.declare({
  method:     'get',
  route:      '/task/:taskId',
  name:       'task',
  idempotent: true,
  scopes:     undefined,
  output:     SCHEMA_PREFIX_CONST + 'task.json#',
  title:      "Get Task Definition",
  description: [
    "This end-point will return the task-definition. Note, that the task",
    "definition may have been modified by "
  ].join('\n')
}, async function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

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
  method:   'get',
  route:    '/task/:taskId/status',
  name:     'status',
  scopes:   undefined,  // Still no auth required
  input:    undefined,  // No input is accepted
  output:   SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:    "Get task status",
  description: [
    "Get task status structure from `taskId`"
  ].join('\n')
}, async function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

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

  return null;
};

/** Create tasks */
api.declare({
  method:     'put',
  route:      '/task/:taskId',
  name:       'createTask',
  idempotent: true,
  scopes:     ['queue:create-task:<provisionerId>/<workerType>'],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'create-task-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
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
    "routing-key: `<route>`, then the poster will be required to posses the",
    "scope `queue:route:<route>`. And when the an AMQP message about the task",
    "is published the message will be CC'ed with the routing-key: ",
    "`route.<route>`. This is useful if you want another component to listen",
    "for completed tasks you have posted."
  ].join('\n')
}, async function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Find scopes required for task specific routes
  var routeScopes = taskDef.routes.map(function(route) {
    return 'queue:route:' + route;
  });

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if (!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType
  }) || !req.satisfies([taskDef.scopes])
     || !req.satisfies([routeScopes])) {
    return;
  }

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.status(detail.code).json(detail.json);
  }

  // Insert entry in deadline queue (garbage entries are acceptable)
  await this.queueService.putDeadlineMessage(
    taskId, new Date(taskDef.deadline)
  );

  // Try to create Task entity
  try {
    let task = await this.Task.create({
      taskId:           taskId,
      provisionerId:    taskDef.provisionerId,
      workerType:       taskDef.workerType,
      schedulerId:      taskDef.schedulerId,
      taskGroupId:      taskDef.taskGroupId,
      routes:           taskDef.routes,
      retries:          taskDef.retries,
      retriesLeft:      taskDef.retries,
      created:          new Date(taskDef.created),
      deadline:         new Date(taskDef.deadline),
      expires:          new Date(taskDef.expires),
      scopes:           taskDef.scopes,
      payload:          taskDef.payload,
      metadata:         taskDef.metadata,
      tags:             taskDef.tags,
      extra:            taskDef.extra,
      runs:             [{
        runId:          0,
        state:          'pending',
        reasonCreated:  'scheduled',
        scheduled:      new Date().toJSON()
      }],
      claim:            {}
    });
  }
  catch (err) {
    // We can handle cases where entity already exists, not that, we re-throw
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // load task, and task definition
    let task = await this.Task.load({taskId: taskId});
    let def  = await task.definition();

    // Compare the two task definitions and ensure there is a at-least one run
    // otherwise the task would have been created with defineTask, and we don't
    // offer an idempotent operation in that case
    if (!_.isEqual(taskDef, def) || task.runs.length === 0) {
      return res.status(409).json({
        message:      "taskId already used by another task"
      });
    }
  }

  // If first run isn't pending, all message must have been published before,
  // this can happen if we came from the catch-branch (it's unlikely to happen)
  if (task.runs[0].state === 'pending') {
    return res.reply({
      status:   task.status()
    });
  }

  // Publish task-defined message, we want this arriving before the task-pending
  // message, so we have to await publication here
  await this.publisher.taskDefined({
    status:         task.status(),
    runId:          0
  }, task.routes);

  // Put message in appropriate azure queue, and publish message to pulse
  await Promise.all([
    this.queueService.putPendingMessage(task, 0),
    this.publisher.taskPending({
      status:         task.status(),
      runId:          0
    }, task.routes)
  ]);

  // Reply
  return res.reply({
    status:         task.status()
  });
});

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/define',
  name:       'defineTask',
  scopes:     [
    'queue:define-task:<provisionerId>/<workerType>',
    'queue:create-task:<provisionerId>/<workerType>'
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'create-task-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
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
    "**Note** this operation is **idempotent**, as long as you upload the same",
    "task definition as previously defined this operation is safe to retry."
  ].join('\n')
}, async function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Find scopes required for task-specific routes
  var routeScopes = taskDef.routes.map(function(route) {
    return 'queue:route:' + route;
  });

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if(!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType
  }) || !req.satisfies([taskDef.scopes])
     || !req.satisfies([routeScopes])) {
    return;
  }

  // Patch default values and validate timestamps
  var detail = patchAndValidateTaskDef(taskId, taskDef);
  if (detail) {
    return res.status(detail.code).json(detail.json);
  }

  // Insert entry in deadline queue (garbage entries are acceptable)
  await this.queueService.putDeadlineMessage(
    taskId, new Date(taskDef.deadline)
  );

  // Try to create Task entity
  try {
    let task = await this.Task.create({
      taskId:           taskId,
      provisionerId:    taskDef.provisionerId,
      workerType:       taskDef.workerType,
      schedulerId:      taskDef.schedulerId,
      taskGroupId:      taskDef.taskGroupId,
      routes:           taskDef.routes,
      retries:          taskDef.retries,
      retriesLeft:      taskDef.retries,
      created:          new Date(taskDef.created),
      deadline:         new Date(taskDef.deadline),
      expires:          new Date(taskDef.expires),
      scopes:           taskDef.scopes,
      payload:          taskDef.payload,
      metadata:         taskDef.metadata,
      tags:             taskDef.tags,
      extra:            taskDef.extra,
      runs:             [],
      claim:            {}
    });
  }
  catch (err) {
    // We can handle cases where entity already exists, not that, we re-throw
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // load task, and task definition
    let task = await this.Task.load({taskId: taskId});
    let def  = await task.definition();

    // Compare the two task definitions
    // (ignore runs as this method don't create them)
    if (!_.isEqual(taskDef, def)) {
      return res.status(409).json({
        message:      "taskId already used by another task"
      });
    }
  }

  // If runs are present, then we don't need to publish messages as this must
  // have happened already...
  // this can happen if we came from the catch-branch (it's unlikely to happen)
  if (task.runs.length > 0) {
    return res.reply({
      status:   task.status()
    });
  }

  // Publish task-defined message
  await this.publisher.taskDefined({
    status:         task.status(),
    runId:          0
  }, task.routes);

  // Reply
  return res.reply({
    status:         task.status()
  });
});


/** Schedule previously defined tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/schedule',
  name:       'scheduleTask',
  scopes:     [
    [
      'queue:schedule-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
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
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

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

  // Ensure that we have an initial run
  await task.modify((task) => {
    // Don't modify if there already is a run
    if (task.runs.length > 0) {
      return;
    }

    // Add initial run (runId = 0)
    task.runs.push({
      runId:          0,
      state:          'pending',
      reasonCreated:  'scheduled',
      scheduled:      new Date().toJSON()
    });
  });

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  if (task.runs[0].state === 'pending') {
    await Promise.all([
      this.queueService.putPendingMessage(task, 0),
      this.publisher.taskPending({
        status:         task.status(),
        runId:          0
      }, task.routes)
    ]);
  }

  return res.reply({
    status:     task.status()
  });
});

/** Rerun a previously resolved task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/rerun',
  name:       'rerunTask',
  scopes:     [
    [
      'queue:rerun-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
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
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

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
    var state = task.state();
    if (state === 'pending' || state === 'running') {
      return;
    }

    // Add a new run
    task.runs.push({
      runId:          task.runs.length,
      state:          'pending',
      reasonCreated:  'rerun',
      scheduled:      new Date().toJSON()
    });

    // Reset retries left
    task.retriesLeft = task.retries;
  });

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  if (task.state() === 'pending') {
    var runId = task.runs.length - 1;
    await Promise.all([
      this.queueService.putPendingMessage(task, runId),
      this.publisher.taskPending({
        status:         task.status(),
        runId:          runId
      }, task.routes)
    ]);
  }

  return res.reply({
    status:     task.status()
  });
});


/** Cancel a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/cancel',
  name:       'cancelTask',
  scopes:     [
    [
      'queue:cancel-task',
      'assume:scheduler-id:<schedulerId>/<taskGroupId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined, // No input accepted
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:      "Cancel Task",
  description: [
    "This method will cancel a task that is either `unscheduled`, `pending` or",
    "`running`. It will resolve the current run as `exception` with",
    "`resolvedReason` set to `canceled`. If the task isn't scheduled yet, ie.",
    "it doesn't have any runs, an initial run will be added and resolved as",
    "described above. Hence, after canceling a task, it cannot be scheduled",
    "with `queue.scheduleTask`, but a new run can be created with",
    "`queue.rerun`.",
    "",
    "**Remark** this operation is idempotent, if you try to cancel a task that",
    "isn't `unscheduled`, `pending` or `running`, this operation will just",
    "return the current task status."
  ].join('\n')
}, async function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

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
    schedulerId:    task.schedulerId,
    taskGroupId:    task.taskGroupId
  })) {
    return;
  }

  /*
    if task.claim:
      azure.deleteMessage(receipt) // ignore: IfNotExist and PopReceiptMismatch
    Task.modify ->
      task.claim = {};

      If runs.length > 0:
        run.state = exception
        run.reasonResolved = canceled
      else:
        Add runId: 0 with state = exception, etc...

    If lastRun.state == exception && lastRun.reasonResovled == 'canceled'
      Publish task-exception message  // So we're sure the message is deleted

  */

  // Ensure the last run isn't running
  await task.modify((task) => {
    var state = task.state();
    // Don't modify if the last is resolved
    if (_.contains(['completed', 'failed', 'exception'], state)) {
      return;
    }

    if (state)
    // Add a new run
    task.runs.push({
      runId:          task.runs.length,
      state:          'pending',
      reasonCreated:  'rerun',
      scheduled:      new Date().toJSON()
    });
  });

  // Put message in appropriate azure queue, and publish message to pulse,
  // if the initial run is pending
  if (task.state() === 'pending') {
    var runId = task.runs.length - 1;
    await Promise.all([
      this.queueService.putPendingMessage(task, runId),
      this.publisher.taskPending({
        status:         task.status(),
        runId:          runId
      }, task.routes)
    ]);
  }

  return res.reply({
    status:     task.status()
  });
});

/** Poll for a task */
api.declare({
  method:     'get',
  route:      '/poll-task-url/:provisionerId/:workerType',
  name:       'pollTaskUrls',
  scopes: [
    [
      'queue:poll-task-urls',
      'assume:worker-type:<provisionerId>/<workerType>'
    ]
  ],
  deferAuth:  true,
  output:     SCHEMA_PREFIX_CONST + 'poll-task-urls-response.json#',
  title:      "Get Urls to Poll Pending Tasks",
  description: [
    "Get a signed url to get a message from azure queue.",
    "Once messages are polled from here, you can claim the referenced task",
    "with `claimTask`."
  ].join('\n')
}, function(req, res) {
    // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

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
  return ctx.queueService.signedUrl(
    provisionerId,
    workerType
  ).then(function(result) {
    res.reply({
      signedPollTaskUrls: [
        result.getMessage
      ],
      expires:                  result.expiry.toJSON()
    });
  });
});

/** Claim a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/claim',
  name:       'claimTask',
  scopes: [
    [
      'queue:claim-task',
      'assume:worker-type:<provisionerId>/<workerType>',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task-claim-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-claim-response.json#',
  title:      "Claim task",
  description: [
    "claim a task, more to be added later...",
    "",
    "**Warning,** in the future this API end-point will require the presents",
    "of `receipt`, `messageId` and `signature` in the body."
  ].join('\n')
}, function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);

  var workerGroup = req.body.workerGroup;
  var workerId    = req.body.workerId;

  var messageId   = req.body.messageId;
  var receipt     = req.body.receipt;
  var signature   = req.body.signature;

  // Load task status structure to validate that we're allowed to claim it
  return ctx.Task.load(taskId).then(function(task) {
    // if task doesn't exist return 404
    if(!task) {
      return res.status(404).json({
        message: "Task not found, or already resolved!"
      });
    }

    // Authenticate request by providing parameters
    if(!req.satisfies({
      provisionerId:  task.provisionerId,
      workerType:     task.workerType,
      workerGroup:    workerGroup,
      workerId:       workerId
    })) {
      return;
    }

    // Validate signature, if present
    if (signature) {
      var valid = ctx.queueService.validateSignature(
        task.provisionerId, task.workerType,
        taskId, runId,
        task.deadline,
        signature
      );
      if (!valid) {
        return res.status(401).json({
          messsage: "Message was faked!"
        });
      }
    }

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    var claimTimeout = parseInt(ctx.claimTimeout);
    takenUntil.setSeconds(takenUntil.getSeconds() + claimTimeout);

    // Claim run
    return ctx.Task.claimTaskRun(taskId, runId, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      takenUntil:     takenUntil
    }).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        res.status(result.code).json({
          message:      result.message
        });
        if (messageId && receipt && signature) {
          // Delete message from azure queue
          return ctx.queueService.deleteMessage(
            task.provisionerId,
            task.workerType,
            messageId,
            receipt
          );
        }
        return;
      }

      // Delete message from azure queue
      var messageDeleted = Promise.resolve();
      if (messageId && receipt && signature) {
        messageDeleted = ctx.queueService.deleteMessage(
          task.provisionerId,
          task.workerType,
          messageId,
          receipt
        );
      }

      return messageDeleted.then(function() {
        // Announce that the run is running
        return ctx.publisher.taskRunning({
          workerGroup:  workerGroup,
          workerId:     workerId,
          runId:        runId,
          takenUntil:   takenUntil.toJSON(),
          status:       result.status()
        }, result.routes);
      }).then(function() {
        // Reply to caller
        return res.reply({
          workerGroup:  workerGroup,
          workerId:     workerId,
          runId:        runId,
          takenUntil:   takenUntil.toJSON(),
          status:       result.status()
        });
      });
    });
  });
});


/** Reclaim a task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/reclaim',
  name:       'reclaimTask',
  scopes: [
    [
      'queue:claim-task',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  output:     SCHEMA_PREFIX_CONST + 'task-claim-response.json#',
  title:      "Reclaim task",
  description: [
    "reclaim a task more to be added later..."
  ].join('\n')
}, function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);

  return ctx.Task.load(taskId).then(function(task) {
    var workerGroup = task.runs[runId].workerGroup;
    var workerId    = task.runs[runId].workerId;

    // Authenticate request by providing parameters
    if(!req.satisfies({
      workerGroup:    workerGroup,
      workerId:       workerId
    })) {
      return;
    }

    // Set takenUntil to now + claimTimeout
    var takenUntil = new Date();
    var claimTimeout = parseInt(ctx.claimTimeout);
    takenUntil.setSeconds(takenUntil.getSeconds() + claimTimeout);

    // Reclaim run
    return ctx.Task.reclaimTaskRun(taskId, runId, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      takenUntil:     takenUntil
    }).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        return res.status(result.code).json({
          message:      result.message
        });
      }

      // Reply to caller
      return res.reply({
        workerGroup:  workerGroup,
        workerId:     workerId,
        runId:        runId,
        takenUntil:   takenUntil.toJSON(),
        status:       result.status()
      });
    });
  });
});


/** Report task completed */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/completed',
  name:       'reportCompleted',
  scopes: [
    [
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:      "Report Run Completed",
  description: [
    "Report a task completed, resolving the run as `completed`."
  ].join('\n')
}, function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);
  var targetState   = req.body.success ? 'completed' : 'failed';

  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task || !task.runs[runId]) {
      return res.status(404).json({
        message:  "Task not found or already resolved"
      });
    }

    var workerGroup = task.runs[runId].workerGroup;
    var workerId    = task.runs[runId].workerId;

    // Authenticate request by providing parameters
    if(!req.satisfies({
      workerGroup:  workerGroup,
      workerId:     workerId
    })) {
      return;
    }

    // Resolve task run
    return ctx.Task.resolveTask(
      taskId,
      runId,
      targetState,
      targetState
    ).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        return res.status(result.code).json({
          message:      result.message
        });
      }


      // Publish message
      var published = null;
      if (targetState === 'completed') {
        published = ctx.publisher.taskCompleted({
          status:       result.status(),
          runId:        runId,
          workerGroup:  workerGroup,
          workerId:     workerId
        }, task.routes);
      } else {
        published = ctx.publisher.taskFailed({
          status:       result.status(),
          runId:        runId,
          workerGroup:  workerGroup,
          workerId:     workerId
        }, task.routes);
      }

      return published.then(function() {
        return res.reply({
          status:   result.status()
        });
      });
    });
  });
});


/** Report task failed */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/failed',
  name:       'reportFailed',
  scopes: [
    [
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      undefined,  // No input at this point
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
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
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);

  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task || !task.runs[runId]) {
      return res.status(404).json({
        message:  "Task not found or already resolved"
      });
    }

    var workerGroup = task.runs[runId].workerGroup;
    var workerId    = task.runs[runId].workerId;

    // Authenticate request by providing parameters
    if(!req.satisfies({
      workerGroup:  workerGroup,
      workerId:     workerId
    })) {
      return;
    }

    // Resolve task run
    return ctx.Task.resolveTask(
      taskId,
      runId,
      'failed',
      'failed'
    ).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        return res.status(result.code).json({
          message:      result.message
        });
      }


      // Publish message
      return ctx.publisher.taskFailed({
        status:       result.status(),
        runId:        runId,
        workerGroup:  workerGroup,
        workerId:     workerId
      }, task.routes).then(function() {
        return res.reply({
          status:   result.status()
        });
      });
    });
  });
});

/** Report task exception */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/exception',
  name:       'reportException',
  scopes: [
    [
      'queue:resolve-task',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task-exception-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:      "Report Task Exception",
  description: [
    "Resolve a run as _exception_. Generally, you will want to report tasks as",
    "failed instead of exception. But if the payload is malformed, or",
    "dependencies referenced does not exists you should also report exception.",
    "However, do not report exception if an external resources is unavailable",
    "because of network failure, etc. Only if you can validate that the",
    "resource does not exist."
  ].join('\n')
}, function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);
  var reason        = req.body.reason;

  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task || !task.runs[runId]) {
      return res.status(404).json({
        message:  "Task not found or already resolved"
      });
    }

    var workerGroup = task.runs[runId].workerGroup;
    var workerId    = task.runs[runId].workerId;

    // Authenticate request by providing parameters
    if(!req.satisfies({
      workerGroup:  workerGroup,
      workerId:     workerId
    })) {
      return;
    }

    // Resolve task run
    return ctx.Task.resolveTask(
      taskId,
      runId,
      'exception',
      reason
    ).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        return res.status(result.code).json({
          message:      result.message
        });
      }


      // Publish message
      return ctx.publisher.taskException({
        status:       result.status(),
        runId:        runId,
        workerGroup:  workerGroup,
        workerId:     workerId
      }, task.routes).then(function() {
        return res.reply({
          status:   result.status()
        });
      });
    });
  });
});



// Load artifacts.js so API end-points declared in that file is loaded
require('./artifacts');

/** Count pending tasks for workerType */
api.declare({
  method:     'get',
  route:      '/pending/:provisionerId/:workerType',
  name:       'pendingTasks',
  scopes:     ['queue:pending-tasks:<provisionerId>/<workerType>'],
  deferAuth:  true,
  output:     undefined,  // TODO: define schema later
  title:      "Get Number of Pending Tasks",
  description: [
    "Documented later...",
    "This probably the end-point that will remain after rewriting to azure",
    "queue storage...",
    "",
    "**Warning: This is an experimental end-point!**"
  ].join('\n')
}, function(req, res) {
  // Validate parameters
  if (!checkParams(req, res)) {
    return;
  }

  var ctx           = this;
  var provisionerId = req.params.provisionerId;
  var workerType    = req.params.workerType;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    provisionerId:  provisionerId,
    workerType:     workerType
  })) {
    return;
  }

  // This implementation is stupid... but it works, just disregard
  // implementation details...
  return ctx.Task.pendingTasks(provisionerId).then(function(result) {
    return res.reply(result[workerType] || 0);
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
