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
 *   Task:           // Task subclass from queue/Task.js
 *   taskstore:      // Azure blob storage container used for task definitions
 *                   // Stores:
 *                   //   - <taskId>/task.json
 *                   //   - <taskId>/status.json (serialized task status)
 *   artifactBucket: // S3 bucket used for artifacts
 *   artifactStore:  // Azure blob storage container used for artifacts
 *   publisher:      // publisher from base.Exchanges
 *   validator:      // base.validator
 *   Artifacts:      // base.Entity subclass
 *   claimTimeout:   // Number of seconds before a claim expires
 *   cfg:            // Configuration object
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

// Export api
module.exports = api;

/** Create tasks */
api.declare({
  method:     'put',
  route:      '/task/:taskId',
  name:       'createTask',
  idempotent: true,
  scopes:     ['queue:put:task:<provisionerId>/<workerType>'],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:      "Create new task",
  description: [
    "Create a new task, this is an **idempotent** operation, so repeat it if",
    "you get an internal server error.",
    "Deadline is at most 7 days into the future"
  ].join('\n')
}, function(req, res) {
  var ctx = this;
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if(!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType
  }) || ! req.satisfies([taskDef.scopes])) {
    return;
  }

  // Validate that deadline is less than a week from now
  var aWeekFromNow = new Date();
  aWeekFromNow.setDate(aWeekFromNow.getDate() + 8);
  if (new Date(taskDef.deadline) > aWeekFromNow) {
    return res.json(400, {
      message:    "Deadline cannot be more than 1 week into the future",
      error: {
        deadline: taskDef.deadline
      }
    });
  }

  // Conditional put to azure blob storage
  return ctx.taskstore.putIfNotMatch(taskId + '/task.json', {
    version:    1,
    definition: taskDef
  }).then(function() {
    // Create task in database, load it if it exists, task creation should be
    // an idempotent operation
    return ctx.Task.create({
      version:        1,
      taskId:         taskId,
      provisionerId:  taskDef.provisionerId,
      workerType:     taskDef.workerType,
      priority:       taskDef.priority,
      created:        taskDef.created,
      deadline:       taskDef.deadline,
      retriesLeft:    taskDef.retries,
      routing:        taskDef.routing,
      owner:          taskDef.metadata.owner,
      runs: [
        {
          runId:          0,
          state:          'pending',
          reasonCreated:  'scheduled',
          scheduled:      new Date().toJSON()
        }
      ]
    }, true).then(function(task) {
      // Publish notification on AMQP
      return ctx.publisher.taskPending({
        status:         task.status(),
        runId:          _.last(task.runs).runId
      }, task.routing).then(function() {
        // Reply to caller
        debug("New task created: %s", taskId);
        res.reply({
          status:       task.status()
        });
      });
    });
  }, function(err) {
    // Handle error in case the taskId is already in use, with another task
    // definition
    if (err.code == 'BlobAlreadyExists') {
      return res.json(409, {
        message:      "taskId already used by another task"
      });
    }
    throw err;
  });
});

/** Get task */
api.declare({
  method:     'get',
  route:      '/task/:taskId',
  name:       'getTask',
  idempotent: true,
  scopes:     undefined,
  output:     SCHEMA_PREFIX_CONST + 'task.json#',
  title:      "Fetch Task",
  description: [
    "Get task definition from queue."
  ].join('\n')
}, function(req, res) {
  var ctx = this;
  var taskId  = req.params.taskId;

  // Fetch task from azure blob storage
  return ctx.taskstore.get(taskId + '/task.json', true).then(function(data) {
    // Handle case where task doesn't exist
    if (!data) {
      return res.json(404, {
        message:  "task not found"
      });
    }
    // Check version of data stored
    assert(data.version === 1, "version 1 was expected, don't know how to " +
           "read newer versions");

    // Return task definition
    return res.reply(data.definition);
  });
});

/** Define tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/define',
  name:       'defineTask',
  scopes:     [
    'queue:post:define-task:<provisionerId>/<workerType>',
    'queue:put:task:<provisionerId>/<workerType>'
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task.json#',
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
}, function(req, res) {
  var ctx = this;
  var taskId  = req.params.taskId;
  var taskDef = req.body;

  // Authenticate request by providing parameters, and then validate that the
  // requester satisfies all the scopes assigned to the task
  if(!req.satisfies({
    provisionerId:  taskDef.provisionerId,
    workerType:     taskDef.workerType
  }) || ! req.satisfies([taskDef.scopes])) {
    return;
  }

  // Validate that deadline is less than a week from now
  var aWeekFromNow = new Date();
  aWeekFromNow.setDate(aWeekFromNow.getDate() + 8);
  if (new Date(taskDef.deadline) > aWeekFromNow) {
    return res.json(400, {
      message:    "Deadline cannot be more than 1 week into the future",
      error: {
        deadline: taskDef.deadline
      }
    });
  }

  // Conditional put to azure blob storage
  return ctx.taskstore.putIfNotMatch(taskId + '/task.json', {
    version:    1,
    definition: taskDef
  }).then(function() {
    // Create task in database, load it if it exists, task creation should be
    // an idempotent operation
    return ctx.Task.create({
      version:        1,
      taskId:         taskId,
      provisionerId:  taskDef.provisionerId,
      workerType:     taskDef.workerType,
      priority:       taskDef.priority,
      created:        taskDef.created,
      deadline:       taskDef.deadline,
      retriesLeft:    taskDef.retries,
      routing:        taskDef.routing,
      owner:          taskDef.metadata.owner,
      runs:           []
    }, true);
  }).then(function(task) {
    // Reply to caller
    debug("New task defined: %s", taskId);
    res.reply({
      status:       task.status()
    });
  }).catch(function(err) {
    // Handle error in case the taskId is already in use, with another task
    // definition
    if (err.code == 'BlobAlreadyExists') {
      return req.json(409, {
        message:      "taskId already used by another task"
      });
    }
    throw err;
  });
});



/** Schedule previously defined tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/schedule',
  name:       'scheduleTask',
  scopes:     [
    'queue:post:schedule-task:<provisionerId>/<workerType>',
    'queue:put:task:<provisionerId>/<workerType>'
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
}, function(req, res) {
  var ctx = this;
  var taskId = req.params.taskId;

  // Load task status structure to find provisionerId and workerType
  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task) {
      return res.json(404, {
        message:  "Task not found already resolved"
      });
    }

    // Authenticate request by providing parameters
    if(!req.satisfies({
      provisionerId:  task.provisionerId,
      workerType:     task.workerType
    })) {
      return;
    }

    // If allowed, schedule the task in question
    return ctx.Task.schedule(taskId).then(function(task) {
      // Make sure it's announced
      return announced = ctx.publisher.taskPending({
        status:     task.status(),
        runId:      _.last(task.runs).runId
      }, task.routing).then(function() {
        // Wait for announcement to be completed, then reply to caller
        res.reply({
          status:     task.status()
        });
      });
    });
  });
});

/** Get task */
api.declare({
  method:   'get',
  route:    '/task/:taskId',
  name:     'getTask',
  scopes:   undefined,  // Still no auth required
  input:    undefined,  // No input is accepted
  output:   'http://schemas.taskcluster.net/queue/v1/task.json#',
  title:    "Get task",
  description: [
    "Get task structure from `taskId`"
  ].join('\n')
}, function(req, res) {
  // TODO: Once we move tasks to azure use information stored in the status
  // table instead of this hardcoded value.
  res.redirect(this.bucket.publicUrl(req.params.taskId + '/task.json'));
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
}, function(req, res) {
  var ctx     = this;
  var taskId  = req.params.taskId;

  // Try to load status from database
  return ctx.Task.load(taskId).then(function(task) {
    if (!task) {
      // Try to load status from blob storage
      return ctx.taskstore.get(
        taskId + '/status.json',
        true  // Return null if doesn't exists
      ).then(function(taskData) {
        if (taskData) {
          return ctx.Task.deserialize(taskData);
        }
      });
    }
    return task;
  }).then(function(task) {;
    if (!task) {
      res.json(404, {
        message: "Task not found"
      });
    }
    // Reply with task status
    return res.reply({
      status: task.status()
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
      'queue:post:claim-task',
      'queue:assume:worker-type:<provisionerId>/<workerType>',
      'queue:assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task-claim-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-claim-response.json#',
  title:      "Claim task",
  description: [
    "claim a task, more to be added later..."
  ].join('\n')
}, function(req, res) {
  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);

  var workerGroup = req.body.workerGroup;
  var workerId    = req.body.workerId;

  // Load task status structure to validate that we're allowed to claim it
  return ctx.Task.load(taskId).then(function(task) {
    // if task doesn't exist return 404
    if(!task) {
      return res.json(404, {
        message: "Task not found, or already resolved!"
      });
    }

    // Authenticate request by providing parameters
    if(!req.satisfies({
      provisionerId:  task.provisionerId,
      workerType:     task.workerId,
      workerGroup:    workerGroup,
      workerId:       workerId
    })) {
      return;
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
        return res.json(result.code, {
          message:      result.message
        });
      }

      // Announce that the run is running
      return ctx.publisher.taskRunning({
        workerGroup:  workerGroup,
        workerId:     workerId,
        runId:        runId,
        takenUntil:   takenUntil.toJSON(),
        status:       result.status()
      }, result.routing).then(function() {
        // Reply to caller
        return res.reply({
          workerGroup:  workerGroup,
          workerId:     workerId,
          runId:        runId,
          takenUntil:   takenUntil.toJSON(),
          status:       result.status()
        });
      })
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
      'queue:post:claim-task',
      'queue:assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  output:     SCHEMA_PREFIX_CONST + 'task-claim-response.json#',
  title:      "Reclaim task",
  description: [
    "reclaim a task more to be added later..."
  ].join('\n')
}, function(req, res) {
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
        return res.json(result.code, {
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

/** Fetch work for a worker */
api.declare({
  method:     'post',
  route:      '/claim-work/:provisionerId/:workerType',
  name:       'claimWork',
  scopes: [
    [
      'queue:post:claim-task-run',
      'queue:assume:worker-type:<provisionerId>/<workerType>',
      'queue:assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'task-claim-request.json#',
  output:     SCHEMA_PREFIX_CONST + 'task-claim-response.json#',
  title:      "Claim work for a worker",
  description: [
    "Claim work for a worker, returns information about an appropriate task",
    "claimed for the worker. Similar to `claimTaskRun`, which can be",
    "used to claim a specific task, or reclaim a specific task extending the",
    "`takenUntil` timeout for the run.",
    "",
    "**Note**, that if no tasks are _pending_ this method will not assign a",
    "task to you. Instead it will return `204` and you should wait a while",
    "before polling the queue again. To avoid polling declare a RabbitMQ queue",
    "for your `workerType` claim work using `claimTaskRun`."
  ].join('\n')
}, function(req, res) {
  var ctx = this;

  var provisionerId   = req.params.provisionerId;
  var workerType      = req.params.workerType;

  var workerGroup     = req.body.workerGroup;
  var workerId        = req.body.workerId;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    provisionerId:  provisionerId,
    workerType:     workerId,
    workerGroup:    workerGroup,
    workerId:       workerId
  })) {
    return;
  }

  // Set takenUntil to now + 20 min
  var takenUntil = new Date();
  takenUntil.setSeconds(takenUntil.getSeconds() + 20 * 60);

  // Claim an arbitrary task
  return ctx.Task.claimWork({
    provisionerId:  provisionerId,
    workerType:     workerType,
    workerGroup:    workerGroup,
    workerId:       workerId
  }).then(function(result) {
    // Return the "error" message if we have one
    if(!(result instanceof ctx.Task)) {
      return res.json(result.code, {
        message:      result.message
      });
    }

    // Get runId from run that was claimed
    var runId = _.last(result.runs).runId;

    // Announce that the run is running
    return ctx.publisher.taskRunning({
      workerGroup:  workerGroup,
      workerId:     workerId,
      runId:        runId,
      takenUntil:   takenUntil.toJSON(),
      status:       result.status()
    }, result.routing).then(function() {
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
  method:   'post',
  route:    '/task/:taskId/runs/:runId/completed',
  name:     'reportCompleted',
  scopes: [
    [
      'queue:post:task-completed',
      'queue:assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  input:    SCHEMA_PREFIX_CONST + 'task-completed-request.json#',
  output:   SCHEMA_PREFIX_CONST + 'task-status-response.json#',
  title:    "Report Run Completed",
  description: [
    "Report a run completed, resolving the run as `completed`."
  ].join('\n')
}, function(req, res) {
  var ctx = this;

  var taskId        = req.params.taskId;
  var runId         = parseInt(req.params.runId);
  var success       = req.body.success;

  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task || !task.runs[runId]) {
      return res.json(404, {
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

    // Report task run as completed
    return ctx.Task.completeTask(taskId, runId, {
      success:    success
    }).then(function(result) {
      // Return the "error" message if we have one
      if(!(result instanceof ctx.Task)) {
        return res.json(result.code, {
          message:      result.message
        });
      }

      // Publish a completed message
      return ctx.publisher.taskCompleted({
        status:       task.status(),
        runId:        runId,
        success:      success,
        workerGroup:  workerGroup,
        workerId:     workerId
      }, task.routing).then(function() {
        return res.reply({
          status:   result.status()
        });
      });
    });
  });
});


/** Rerun a previously resolved task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/rerun',
  name:       'rerunTask',
  scopes:     ['queue:post:rerun:<provisionerId>/<workerType>'],
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
}, function(req, res) {
  var ctx     = this;
  var taskId  = req.params.taskId;

  // Fetch task from blob storage and validate scopes and find retries
  return ctx.taskstore.get(taskId + '/task.json', true).then(function(data) {
    // Check that we got a task definition
    if (!data) {
      return res.json(400, {
        message:  "Task definition doesn't exist"
      });
    }

    // Check version of task information loaded
    assert(data.version === 1, "Expect task definition format version 1, "+
                               "don't know how to read newer versions");

    // Authenticate request by providing parameters
    if(!req.satisfies({
      provisionerId:  data.definition.provisionerId,
      workerType:     data.definition.workerType
    })) {
      return;
    }

    // Rerun the task
    return ctx.Task.rerunTask(taskId, {
      retries:  data.definition.retries,
      fetch:    function() {
                  return ctx.taskstore.get(taskId  + '/status.json', true);
                }
    }).then(function(result) {
      // Handle error cases
      if (!(result instanceof ctx.Task)) {
        return res.json(result.code, {
          message: result.message
        });
      }

      // Publish message
      return ctx.publisher.taskPending({
        status:     result.status(),
        runId:      _.last(result.runs).runId
      }, result.routing).then(function() {
        // Reply to caller
        return res.reply({
          status:     result.status()
        });
      });
    });
  });
});


// Load artifacts.js so API end-points declared in that file is loaded
require('./artifacts');


/** Fetch pending tasks */
api.declare({
  method:   'get',
  route:    '/pending-tasks/:provisionerId',
  name:     'getPendingTasks',
  scopes:   undefined,  // Still no auth required
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Fetch pending tasks for provisioner",
  description: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {
  var ctx           = this;
  var provisionerId = req.params.provisionerId;

  // When loaded reply
  ctx.Task.queryPending(provisionerId).then(function(tasks) {
    return res.reply({
      tasks: tasks
    });
  });
});

/** Fetch AMQP Connection String */
api.declare({
  method:   'get',
  route:    '/settings/amqp-connection-string',
  name:     'getAMQPConnectionString',
  scopes:   undefined,  // Still no auth required
  input:    undefined,  // No input accepted
  output:   'http://schemas.taskcluster.net/queue/v1/amqp-connection-string-response.json#',
  title:    "Fetch AMQP Connection String",
  description: [
    "Most hosted AMQP services requires us to specify a virtual host, ",
    "so hardcoding the AMQP connection string into various services would be ",
    "a bad solution. Hence, we offer all authorized queue consumers to fetch ",
    "an AMQP connection string using the API end-point.",
    "",
    "**Warning**, this API end-point is not stable, and may change in the ",
    "future the strategy of not hardcoding AMQP connection details into ",
    "various components obviously makes sense. But as we have no method of ",
    "notifying consumers that the connection string have moved. This ",
    "approach may not be optimal either. Thus, we may be choose to remove ",
    "this API end-point when `pulse.mozilla.org` is a stable AMQP service ",
    "we can rely on."
  ].join('\n')
}, function(req, res) {
  return res.reply({
    url:  this.cfg.get('amqp:url')
  });
});
