var utils     = require('./utils');
var Promise   = require('promise');
var debug     = require('debug')('routes:api:0.2.0');
var slugid    = require('slugid');
var validate  = require('../../utils/validate');
var assert    = require('assert');

/** API end-point for version v1/ */
var api = module.exports = new utils.API({
  limit:          '10mb'
});

/** Create tasks */
api.declare({
  method:   'post',
  route:    '/task/new',
  name:     'createTask',
  input:    'http://schemas.taskcluster.net/queue/v1/task.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/create-task-response.json#',
  title:    "Create new task",
  desc: [
    "Create a new task, the `status` of the resulting JSON is a task status",
    "structure, you can find the `taskId` in this structure, enjoy."
  ].join('\n')
}, function(req, res) {
  var Bucket = req.app.get('bucket');
  var Db = req.app.get('db');
  var Events = req.app.get('events');

  // Create task identifier
  var taskId = slugid.v4();

  // Task status structure to reply with in case of success
  var taskStatus = {
    taskId:               taskId,
    provisionerId:        req.body.provisionerId,
    workerType:           req.body.workerType,
    runs:                 [],
    state:                'pending',
    reason:               'none',
    routing:              req.body.routing,
    timeout:              req.body.timeout,
    retries:              req.body.retries,
    priority:             req.body.priority,
    created:              req.body.created,
    deadline:             req.body.deadline,
    takenUntil:           new Date(0).toJSON()
  };

  // Upload to S3, notice that the schema is validated by middleware
  return Bucket.put(
    taskId + '/task.json',
    req.body
  ).then(function() {
    var taskInDb = Db.create(taskStatus);
    var pendingEvent = Events.publish('task-pending', {
      version:    '0.2.0',
      status: taskStatus
    });

    return Promise.all([taskInDb, pendingEvent]);

  }).then(function() {
    debug('new task', taskStatus);
    return res.reply({ status: taskStatus });
  });
});

/** Define tasks */
api.declare({
  method:     'get',
  route:      '/define-tasks',
  name:       'defineTasks',
  input:      'http://schemas.taskcluster.net/queue/v1/define-tasks-request.json#',
  output:     'http://schemas.taskcluster.net/queue/v1/define-tasks-response.json#',
  title:      "Define Tasks",
  desc: [
    "Request a number of `taskId`s and signed URL to which the tasks can be",
    "uploaded. The tasks will not be scheduled, to do this you must called the",
    "`/task/:taskId/schedule` API end-point.",
    "",
    "The purpose of this API end-point is allow schedulers to upload a set of",
    "tasks to S3 without the tasks becoming _pending_ immediately. This useful",
    "if you have a set of dependent tasks. Then you can upload all the tasks",
    "and when the dependencies of a tasks have been resolved, you can schedule",
    "the task by calling `/task/:taskId/schedule`. This eliminates the need to",
    "store tasks somewhere else while waiting for dependencies to resolve.",
    "",
    "**Remark** the queue does not track tasks before they have been ",
    "_scheduled_, hence, you'll not able to call `/task/:taskId/status` with",
    "`taskId`s assigned here, before they are scheduled with",
    "`/task/:taskId/schedule`."
  ].join('\n')
}, function(req, res) {
  var Bucket = req.app.get('bucket');
  var Db = req.app.get('tasksDb');

  var tasksRequested = req.body.tasksRequested;

  // Set expires to now + 20 min
  var expires = new Date();
  var timeout = 20 * 60;
  expires.setSeconds(expires.getSeconds() + timeout);

  // Mapping from tasks to URLs
  var tasks = {};

  var signaturePromises = [];
  while(signaturePromises.length < tasksRequested) {
    signaturePromises.push((function() {
      var taskId = slugid.v4();
      return Bucket.signedPutUrl(
        taskId + '/task.json',
        timeout
      ).then(function(url) {
        tasks[taskId] = {
          taskPutUrl: url
        };
      });
    })());
  }

  // When all signatures have been generated we
  return Promise.all(signaturePromises).then(function() {
    return res.reply({
      expires:  expires.toJSON(),
      tasks:    tasks
    });
  });
});


/** Schedule previously defined tasks */
api.declare({
  method:     'post',
  route:      '/task/:taskId/schedule',
  name:       'scheduleTask',
  input:      undefined, // No input accepted
  output:     'http://schemas.taskcluster.net/queue/v1/task-schedule-response.json#',
  title:      "Schedule Defined Task",
  desc: [
    "If you've uploaded task definitions to PUT URLs obtained from",
    "`/define-tasks`, then you can schedule the tasks using this method.",
    "This will down fetch and validate the task definition against the",
    "required JSON schema.",
    "",
    "This method has the same response as `/task/new`, using this method in",
    "combination with `/define-tasks` is just an efficient way of storing",
    "and defining a set of tasks you want to schedule later.",
    "",
    "**Note** this operation is **idempotent** and will not fail or complain",
    "if called with `taskId` that is already scheduled, or even resolved.",
    "To reschedule a task previously resolved, use `/task/:taskId/rerun`."
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');
  var Events = req.app.get('events');

  // Get taskId from parameter
  var taskId = req.params.taskId;

  var gotTask = Bucket.get(taskId + '/task.json');
  var gotResolution = Bucket.get(taskId + '/resolution.json');

  // Load task status from database
  var gotStatus = Db.findBySlug(taskId);

  // When state is loaded check what to do
  return Promise.all(
    gotTask,
    gotResolution,
    gotStatus
  ).spread(function(task, resolution, taskStatus) {
    // If task wasn't present on S3 then that is a problem too
    if (task === null) {
      return res.json(400, {
        message:  "Task definition not uploaded!",
        error:    "Couldn't fetch: " + Bucket.publicUrl(taskId + '/task.json')
      });
    }

    // If we have a task status in database or resolution on S3, then the task
    // can't be scheduled. But for simplicity we let this operation be
    // idempotent, hence, we just ignore the request to schedule the task, and
    // return the latest task status
    if (taskStatus) {
      return res.reply({
        status: taskStatus
      });
    }

    if (resolution) {
      return res.reply({
        status: resolution.status
      });
    }

    // Validate task.json
    var schema = 'http://schemas.taskcluster.net/queue/v1/task.json#';
    var errors = validate(task, schema);
    if (errors) {
      debug("task.json attempted schemed didn't follow schema");
      return res.json(400, {
        message:  "Request payload must follow the schema: " + schema,
        error:    errors
      });
    }

    // Task status structure to reply with in case of success
    taskStatus = {
      taskId:               taskId,
      provisionerId:        task.provisionerId,
      workerType:           task.workerType,
      runs:                 [],
      state:                'pending',
      reason:               'none',
      routing:              task.routing,
      timeout:              task.timeout,
      retries:              task.retries,
      priority:             task.priority,
      created:              new Date(task.created).toJSON(),
      deadline:             new Date(task.deadline).toJSON(),
      takenUntil:           new Date(0).toJSON()
    };

    // Insert into database
    var addedToDatabase = Db.create(taskStatus);

    // Publish message through events
    var eventPublished = Events.publish('task-pending', {
      version:    '0.2.0',
      status:     taskStatus
    });

    // Return a promise that everything happens
    return Promise.all(addedToDatabase, eventPublished).then(function() {
      // Reply with created task status
      return res.reply({
        status:   taskStatus
      });
    });
  });
});


/** Get task status */
api.declare({
  method:   'get',
  route:    '/task/:taskId/status',
  input:    undefined,  // No input is accepted
  output:   'http://schemas.taskcluster.net/queue/v1/task-status-response.json#',
  title:    "Get task status",
  desc: [
    "Get task status structure from `taskId`"
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');

  return Db.findBySlug(req.params.taskId).
    then(function(taskStatus) {
      if (!taskStatus) {
        res.json(404, {
          message: "Task not found or already resolved"
        });
      }

      return res.reply({
        status: taskStatus
      });
    });
});


/** Claim task */
api.declare({
  method:   'post',
  route:    '/task/:taskId/claim',
  name:     'claimTask',
  input:    'http://schemas.taskcluster.net/queue/v1/task-claim-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/task-claim-response.json#',
  title:    "Claim task",
  desc: [
    "Claim task, takes workerGroup, workerId and optionally runId as input",
    "returns task status structure, runId, resultPutUrl and logsPutUrl"
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');
  var Events = req.app.get('events');

  // Get input from request
  var workerGroup     = req.body.workerGroup;
  var workerId        = req.body.workerId;
  var requestedRunId  = req.body.runId || undefined;
  // Get the taskId
  var taskId = req.params.taskId;
  var taskStatus;
  var timeout;

  return Db.findBySlug(taskId).then(function(status) {
    taskStatus = status;
    timeout = taskStatus.timeout;

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

    // Claim task without runId if this is a new claim
    return Db.claim(taskId, takenUntil, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      runId:          requestedRunId || undefined
    });
  }).then(function(runId) {
    // If task wasn't claimed, report 404
    if (!runId) {
      res.json(404, {
        message: "Task not found, or already taken"
      });
      return;
    }

    // Only send event if we have a new runId
    var eventSent = Promise.from(null);
    if (requestedRunId !== runId) {
      // Fire event
      eventSent = Events.publish('task-running', {
        version:      '0.2.0',
        workerGroup:  workerGroup,
        workerId:     workerId,
        runId:        runId,
        logsUrl:      Bucket.publicUrl(taskId + '/runs/' + runId + '/logs.json'),
        status:       taskStatus
      });
    }

    // Sign urls for the reply
    var logsUrlSigned = Bucket.signedPutUrl(
      taskId + '/runs/' + runId + '/logs.json',
      timeout
    );

    // Sign url for uploading task result
    var resultUrlSigned = Bucket.signedPutUrl(
      taskId + '/runs/' + runId + '/result.json',
      timeout
    );

    // Send reply client
    var replySent = Promise.all(
      logsUrlSigned,
      resultUrlSigned
    ).spread(function(logsUrl, resultUrl) {
      return res.reply({
        runId:          runId,
        logsPutUrl:     logsUrl,
        resultPutUrl:   resultUrl,
        status:         taskStatus
      });
    });

    // If either of these fails, then I have no idea what to do... so we'll
    // just do them in parallel... a better strategy might developed in the
    // future, this is just a prototype
    return Promise.all(replySent, eventSent);
  });
});



/** Get artifact urls */
api.declare({
  method:   'post',
  route:    '/task/:taskId/artifact-urls',
  name:     'requestArtifactUrls',
  input:    'http://schemas.taskcluster.net/queue/v1/artifact-url-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/artifact-url-response.json#',
  title:    "Get artifact urls",
  desc: [
    "Get artifact-urls for posted artifact urls..."
  ].join('\n')
}, function(req, res) {

  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');

  // Get input from posted JSON
  var taskId        = req.params.taskId;
  var runId         = req.body.runId;
  var artifacts     = req.body.artifacts;
  var artifactList  = Object.keys(artifacts);

  // Load task
  var taskLoaded = Db.findBySlug(taskId);

  // Let urls timeout after 20 min
  // XXX: Timeouts for the run artifacts are a big race condition at best and a
  //      lot of extra complexity at worst for the reclaims... If a task we
  //      thought timed out somehow pushes artifacts to a particular run this is
  //      unlikely and not a big deal. Losing runs that where successful but
  //      could not push artifacts are expensive (and probably mysterious).
  var timeout = 20 * 60;
  var expires = new Date();
  expires.setSeconds(expires.getSeconds() + timeout);

  debug("Signing URLs for artifacts: %j", artifacts);

  // Get signed urls
  var urlsSigned = artifactList.map(function(artifact) {
    return Bucket.signedPutUrl(
      taskId + '/runs/' + runId + '/artifacts/' + artifact,
      timeout,
      artifacts[artifact].contentType
    );
  });

  // Create a JSON object from signed urls
  var artifactUrls = Promise.all(urlsSigned).then(function(signedUrls) {
    var artifactPrefix = taskId + '/runs/' + runId + '/artifacts/';
    var urlMap = {};
    artifactList.forEach(function(artifact, index) {
      urlMap[artifact] = {
        artifactPutUrl:       signedUrls[index],
        artifactUrl:          Bucket.publicUrl(artifactPrefix + artifact),
        contentType:          artifacts[artifact].contentType
      };
    });
    return urlMap;
  });

  // When loaded reply with task status structure, if found
  return Promise.all(
    taskLoaded,
    artifactUrls
  ).spread(function(taskStatus, urlMap) {
    if (taskStatus) {
      return res.reply({
        status:           taskStatus,
        expires:          expires.toJSON(),
        artifacts:        urlMap
      });
    }
    res.json(404, {
      message:      "Task not found or already resolved"
    });
  });
});


/** Report task as completed */
api.declare({
  method:   'post',
  route:    '/task/:taskId/completed',
  name:     'reportTaskCompleted',
  input:    'http://schemas.taskcluster.net/queue/v1/task-completed-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/task-completed-response.json#',
  title:    "Report Completed Task",
  desc: [
    "Report task completed..."
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');
  var Events = req.app.get('events');

  // Get input from posted JSON
  var taskId        = req.params.taskId;
  var runId         = req.body.runId;
  var workerGroup   = req.body.workerGroup;
  var workerId      = req.body.workerId;
  var success       = req.body.success;

  var taskCompleted = Db.completeTask(taskId);

  return taskCompleted.then(function(completed) {
    if (!completed) {
      res.json(404, {
        message:    "Task not found"
      });
      return;
    }
    return Db.findBySlug(taskId).then(function(task) {
      // Resolution to be uploaded to S3
      var resolution = {
        version:        '0.2.0',
        status:         task,
        resultUrl:      Bucket.publicUrl(taskId + '/runs/' + runId + '/result.json'),
        logsUrl:        Bucket.publicUrl(taskId + '/runs/' + runId + '/logs.json'),
        runId:          runId,
        success:        success,
        workerId:       workerId,
        workerGroup:    workerGroup
      };

      var uploadedToS3 = Bucket.put(
        taskId + '/resolution.json',
        resolution
      );

      var eventPublished = Events.publish('task-completed', {
        version:        '0.2.0',
        status:         task,
        resultUrl:      Bucket.publicUrl(taskId + '/runs/' + runId + '/result.json'),
        logsUrl:        Bucket.publicUrl(taskId + '/runs/' + runId + '/logs.json'),
        runId:          runId,
        success:        success,
        workerId:       workerId,
        workerGroup:    workerGroup
      });

      return Promise.all(
        uploadedToS3,
        eventPublished
      ).then(function() {
        return res.reply({
          status: task
        });
      });
    });
  });
});

/** Fetch work for a worker */
api.declare({
  method:   'post',
  route:    '/claim-work/:provisionerId/:workerType',
  name:     'claimWork',
  input:    'http://schemas.taskcluster.net/queue/v1/claim-work-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/claim-work-response.json#',
  title:    "Claim work for a worker",
  desc: [
    "Claim work for a worker, returns information about an appropriate task",
    "claimed for the worker. Similar to `/v1/task/:taskId/claim`, which can be",
    "used to claim a specific task, or reclaim a specific task extending the",
    "`takenUntil` timeout for the run.",
    "",
    "**Note**, that if no tasks are _pending_ this method will not assign a",
    "task to you. Instead it will return `204` with a timeout you should wait",
    "before polling the queue again. The response has the following form:",
    "`{sleep: <seconds to sleep>}`. To avoid this declare a RabbitMQ queue for",
    "your `workerType` claim work using `/v1/task/:taskId/claim`."
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');
  var Events = req.app.get('events');

  // Get input
  var provisionerId   = req.params.provisionerId;
  var workerType      = req.params.workerType;
  var workerGroup     = req.body.workerGroup;
  var workerId        = req.body.workerId;

  var query = {
    provisionerId: provisionerId,
    state: 'pending',
    workerType: workerType
  };

  // When loaded let's pick a pending task
  return Db.findOne(query).then(function(taskStatus) {
    // if there is no tasks available, report 204
    if (!taskStatus) {
      // Ask worker to sleep for 3 min before polling again
      res.json(204, {
        sleep:        3 * 60
      });
      return;
    }

    // Pick the first task
    var taskId = taskStatus.taskId;

    ///////////// Warning: Code duplication from /task/:taskId/claim
    /////////////          This needs to be refactored, all logic like this
    /////////////          should live in queue/... so it can be reused for new
    /////////////          api versions....

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    var timeout = taskStatus.timeout;
    takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

    // Claim task without runId if this is a new claim
    var taskClaimed = Db.claim(taskId, takenUntil, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      runId:          undefined
    });

    // When claimed
    return taskClaimed.then(function(runId) {
      // If task wasn't claimed, report 404
      if (!runId) {
        res.json(404, {
          message: "Task not found, or already taken"
        });
        return;
      }

      return Db.findBySlug(taskId).then(function(taskStatus) {
        // Load task status structure
        // Fire event
        var eventSent = Events.publish('task-running', {
          version:        '0.2.0',
          workerGroup:    workerGroup,
          workerId:       workerId,
          runId:          runId,
          logsUrl:        Bucket.publicUrl(taskId + '/runs/' + runId + '/logs.json'),
          status:         taskStatus
        });

        // Sign urls for the reply
        var logsUrlSigned = Bucket.signedPutUrl(
          taskId + '/runs/' + runId + '/logs.json',
          timeout
        );

        // Sign url for uploading task result
        var resultUrlSigned = Bucket.signedPutUrl(
          taskId + '/runs/' + runId + '/result.json',
          timeout
        );

        // Send reply client
        var replySent = Promise.all(
          logsUrlSigned,
          resultUrlSigned
        ).then(function(urls) {
          return res.reply({
            runId:          runId,
            logsPutUrl:     urls[0],
            resultPutUrl:   urls[1],
            status:         taskStatus
          });
        });

        // If either of these fails, then I have no idea what to do... so we'll
        // just do them in parallel... a better strategy might developed in the
        // future, this is just a prototype
        return Promise.all(replySent, eventSent);
      });
    });
  });
});


/** Rerun a previously resolved task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/rerun',
  name:       'rerunTask',
  input:      undefined, // No input accepted
  output:     'http://schemas.taskcluster.net/queue/v1/task-rerun-response.json#',
  title:      "Rerun a Resolved Task",
  desc: [
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
  var Db = req.app.get('db');
  var Bucket = req.app.get('bucket');
  var Events = req.app.get('events');

  // Get taskId from parameter
  var taskId = req.params.taskId;

  // Load task.json
  var gotTask = Bucket.get(taskId + '/task.json');

  // Check for resolution
  var gotResolution = Bucket.get(taskId + '/resolution.json');

  // Load task status from database
  var gotStatus = Db.findBySlug(taskId);

  // When state is loaded check what to do
  return Promise.all(
    gotTask,
    gotResolution,
    gotStatus
  ).spread(function(task, resolution, taskStatus) {
    // Check that the task exists and have been scheduled before!
    if (!task) {
      return res.json(400, {
        message:  "Task definition not uploaded and never scheuled!",
        error:    "Couldn't fetch: " + Bucket.publicUrl(taskId + '/task.json')
      });
    }

    if (!taskStatus && !resolution) {
      return res.json(400, {
        message:  "This task have never been scheduled before, can't rerun it",
        error:    "There is no resolution or status for " + taskId
      });
    }

    // Make a promise that task is pending again
    var taskStatusPending = null;

    // If task was deleted from database we create it again
    if (!taskStatus) {
      // Restore task status structure from resolution
      taskStatus = resolution.status;

      // Make the task pending again
      taskStatus.state       = 'pending';
      taskStatus.reason      = 'rerun-requested';
      taskStatus.retries     = task.retries;
      taskStatus.takenUntil  = (new Date(0)).toJSON();

      // Insert into database
      taskStatusPending = Db.create(taskStatus).then(function() {
        return taskStatus;
      });
    } else if (taskStatus.state == 'running' ||
               taskStatus.state == 'pending') {
      // If the task isn't resolved, we do nothing letting this function be
      // idempotent
      debug("Attempt to rerun a task with state: '%s' ignored", taskStatus.state);
      return res.reply({
        status: taskStatus
      });
    } else {
      debug('Rerun task');
      // Rerun the task again
      taskStatusPending = Db.rerunTask(taskId, task.retries);
    }

    // When task is pending again
    return taskStatusPending.then(function(taskStatus) {
      assert(taskStatus, "task cannot be null here!");

      // Reply with created task status
      var sentReply = res.reply({
        status: taskStatus
      });

      // Publish message through events
      var eventPublished = Events.publish('task-pending', {
        version:    '0.2.0',
        status:     taskStatus
      });

      return Promise.all(sentReply, eventPublished);
    });
  });
});


/** Fetch pending tasks */
api.declare({
  method:   'get',
  route:    '/pending-tasks/:provisionerId',
  name:     'getPendingTasks',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Fetch pending tasks for provisioner",
  desc: [
    "Documented later...",
    "",
    "**Warning** this api end-point is **not stable**."
  ].join('\n')
}, function(req, res) {
  var Db = req.app.get('db');
  // Get input
  var provisionerId  = req.params.provisionerId;

  // Load pending tasks
  var taskLoaded = Db.findAll({
    provisionerId: provisionerId
  });

  // When loaded reply
  taskLoaded.then(function(tasks) {
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
  input:    undefined,  // No input accepted
  output:   'http://schemas.taskcluster.net/queue/v1/amqp-connection-string-response.json#',
  title:    "Fetch AMQP Connection String",
  desc: [
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
    url:  req.app.get('nconf').get('amqp:url')
  });
});
