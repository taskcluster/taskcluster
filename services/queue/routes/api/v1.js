var nconf     = require('nconf');
var utils     = require('./utils');
var Promise   = require('promise');
var aws       = require('aws-sdk-promise');
var _         = require('lodash');
var debug     = require('debug')('routes:api:0.2.0');
var slugid    = require('../../utils/slugid');
var validate  = require('../../utils/validate');
var assert    = require('assert');

var data    = require('../../queue/data');
var events  = require('../../queue/events');

// Create S3 instance
var s3 = new aws.S3();

/** API end-point for version v1/ */
var api = module.exports = new utils.API({
  limit:          '10mb'
});

/** Get the url to a prefix within the taskBucket */
var task_bucket_url = function(prefix) {
  // If taskBucket has a CNAME, we build a prettier URL:
  if (nconf.get('queue:taskBucketIsCNAME') == 'true') {
    return 'http://' + nconf.get('queue:taskBucket') + '/' + prefix;
  }
  return 'https://s3-' + nconf.get('aws:region') + '.amazonaws.com/' +
          nconf.get('queue:taskBucket') + '/' + prefix;
};

/** Sign a url for upload to a bucket */
var sign_put_url = function(options) {
  return new Promise(function(accept, reject) {
    s3.getSignedUrl('putObject', options, function(err, url) {
      if(err) {
        reject(err);
      } else {
        accept(url);
      }
    });
  });
};


/** Create tasks */
api.declare({
  method:   'post',
  route:    '/task/new',
  input:    'http://schemas.taskcluster.net/queue/v1/task.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/create-task-response.json#',
  title:    "Create new task",
  desc: [
    "Create a new task, the `status` of the resulting JSON is a task status",
    "structure, you can find the `taskId` in this structure, enjoy."
  ].join('\n')
}, function(req, res) {
  // Create task identifier
  var taskId = slugid.v4();

  // Task status structure to reply with in case of success
  var task_status = {
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
    takenUntil:           (new Date(0)).toJSON()
  };

  // Upload to S3, notice that the schema is validated by middleware
  var uploaded_to_s3 = s3.putObject({
    Bucket:               nconf.get('queue:taskBucket'),
    Key:                  taskId + '/task.json',
    Body:                 JSON.stringify(req.body),
    ContentType:          'application/json'
  }).promise();

  // When upload is completed
  var done = uploaded_to_s3.then(function() {

    // Insert into database
    var added_to_database = data.createTask(task_status);

    // Publish message through events
    var event_published = events.publish('task-pending', {
      version:    '0.2.0',
      status:     task_status
    });

    // Return a promise that everything happens
    return Promise.all(added_to_database, event_published);
  });

  // Reply to request, when task is uploaded to s3, added to database and
  // published over RabbitMQ
  return done.then(function() {
    debug('new task', task_status, { taskIdSlug: slugid.decode(taskId) });
    // Reply that the task was inserted
    return res.reply({
      status: task_status
    });
  });
});

/** Define tasks */
api.declare({
  method:     'get',
  route:      '/define-tasks',
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
  var tasksRequested = req.body.tasksRequested;

  // Set expires to now + 20 min
  var expires = new Date();
  var timeout = 20 * 60;
  expires.setSeconds(expires.getSeconds() + timeout);

  // Mapping from tasks to URLs
  var tasks = {};

  var signature_promises = [];
  while(signature_promises.length < tasksRequested) {
    signature_promises.push((function() {
      var taskId = slugid.v4();
      return sign_put_url({
        Bucket:         nconf.get('queue:taskBucket'),
        Key:            taskId + '/task.json',
        ContentType:    'application/json',
        Expires:        timeout
      }).then(function(url) {
        tasks[taskId] = {
          taskPutUrl:     url
        };
      });
    })());
  }

  // When all signatures have been generated we
  return Promise.all(signature_promises).then(function() {
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
  // Get taskId from parameter
  var taskId = req.params.taskId;

  // Load task.json
  var got_task = s3.getObject({
    Bucket:               nconf.get('queue:taskBucket'),
    Key:                  taskId + '/task.json'
  }).promise().then(function(response) {
    var data = response.data.Body.toString('utf8');
    return JSON.parse(data);
  }, function(err) {
    if (err.code == 'NoSuchKey') {
      return null;
    }
    debug("Failed to get task.json for taskId: %s with error: %s, as JSON: %j",
          err, err, err.stack);
    throw err;
  });

  // Check for resolution
  var got_resolution = s3.getObject({
    Bucket:               nconf.get('queue:taskBucket'),
    Key:                  taskId + '/resolution.json'
  }).promise().then(function(response) {
    var data = response.data.Body.toString('utf8');
    return JSON.parse(data);
  }, function(err) {
    if (err.code == 'NoSuchKey') {
      return null;
    }
    debug("Failed to get resolution for taskId: %s with error: %s, as JSON: %j",
          err, err, err.stack);
    throw err;
  });

  // Load task status from database
  var got_status = data.loadTask(taskId);

  // When state is loaded check what to do
  return Promise.all(
    got_task,
    got_resolution,
    got_status
  ).spread(function(task, resolution, task_status) {
    // If task wasn't present on S3 then that is a problem too
    if (task === null) {
      return res.json(400, {
        message:  "Task definition not uploaded!",
        error:    "Couldn't fetch: " + task_bucket_url(taskId + '/task.json')
      });
    }

    // If we have a task status in database or resolution on S3, then the task
    // can't be scheduled. But for simplicity we let this operation be
    // idempotent, hence, we just ignore the request to schedule the task, and
    // return the latest task status
    if (task_status !== null) {
      return res.reply({
        status:     task_status
      });
    }
    if (resolution !== null) {
      return res.reply({
        status:     resolution.status
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
    task_status = {
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
      created:              task.created,
      deadline:             task.deadline,
      takenUntil:           (new Date(0)).toJSON()
    };

    // Insert into database
    var added_to_database = data.createTask(task_status);

    // Publish message through events
    var event_published = events.publish('task-pending', {
      version:    '0.2.0',
      status:     task_status
    });

    // Return a promise that everything happens
    return Promise.all(added_to_database, event_published).then(function() {
      // Reply with created task status
      return res.reply({
        status:   task_status
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
  // Load task
  var task_loaded = data.loadTask(req.params.taskId);

  // When loaded reply with task status structure, if found
  return task_loaded.then(function(task_status) {
    if (task_status) {
      return res.reply({
        status:     task_status
      });
    }
    res.json(404, {
      message:      "Task not found or already resolved"
    });
  });
});


/** Claim task */
api.declare({
  method:   'post',
  route:    '/task/:taskId/claim',
  input:    'http://schemas.taskcluster.net/queue/v1/task-claim-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/task-claim-response.json#',
  title:    "Claim task",
  desc: [
    "Claim task, takes workerGroup, workerId and optionally runId as input",
    "returns task status structure, runId, resultPutUrl and logsPutUrl"
  ].join('\n')
}, function(req, res) {
  // Get input from request
  var workerGroup     = req.body.workerGroup;
  var workerId        = req.body.workerId;
  var requestedRunId  = req.body.runId || undefined;
  // Get the taskId
  var taskId = req.params.taskId;
  var taskStatus;
  var timeout;

  return data.loadTask(taskId).then(function(status) {
    task_status = status;
    timeout = task_status.timeout;

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

    // Claim task without runId if this is a new claim
    return data.claimTask(taskId, takenUntil, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      runId:          requestedRunId || undefined
    });
  }).then(function(runId) {
    // If task wasn't claimed, report 404
    if(runId === null) {
      res.json(404, {
        message: "Task not found, or already taken"
      });
      return;
    }

    // Only send event if we have a new runId
    var event_sent = Promise.from(null);
    if (requestedRunId !== runId) {
      // Fire event
      event_sent = events.publish('task-running', {
        version:      '0.2.0',
        workerGroup:  workerGroup,
        workerId:     workerId,
        runId:        runId,
        logsUrl:      task_bucket_url(taskId + '/runs/' + runId + '/logs.json'),
        status:       task_status
      });
    }

    // Sign urls for the reply
    var logs_url_signed = sign_put_url({
      Bucket:         nconf.get('queue:taskBucket'),
      Key:            taskId + '/runs/' + runId + '/logs.json',
      ContentType:    'application/json',
      Expires:        timeout
    });

    // Sign url for uploading task result
    var result_url_signed = sign_put_url({
      Bucket:         nconf.get('queue:taskBucket'),
      Key:            taskId + '/runs/' + runId + '/result.json',
      ContentType:    'application/json',
      Expires:        timeout
    });

    // Send reply client
    var reply_sent = Promise.all(
      logs_url_signed,
      result_url_signed
    ).spread(function(logs_url, result_url) {
      return res.reply({
        runId:          runId,
        logsPutUrl:     logs_url,
        resultPutUrl:   result_url,
        status:         task_status
      });
    });

    // If either of these fails, then I have no idea what to do... so we'll
    // just do them in parallel... a better strategy might developed in the
    // future, this is just a prototype
    return Promise.all(reply_sent, event_sent);
  });
});



/** Get artifact urls */
api.declare({
  method:   'post',
  route:    '/task/:taskId/artifact-urls',
  input:    'http://schemas.taskcluster.net/queue/v1/artifact-url-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/artifact-url-response.json#',
  title:    "Get artifact urls",
  desc: [
    "Get artifact-urls for posted artifact urls..."
  ].join('\n')
}, function(req, res) {
  // Get input from posted JSON
  var taskId        = req.params.taskId;
  var runId         = req.body.runId;
  var artifacts     = req.body.artifacts;
  var artifact_list = _.keys(artifacts);

  // Load task
  var task_loaded = data.loadTask(taskId)

  // Let urls timeout after 20 min
  var timeout = 20 * 60;
  var expires = new Date();
  expires.setSeconds(expires.getSeconds() + timeout);

  debug("Signing URLs for artifacts: %j", artifacts);

  // Get signed urls
  var urls_signed = artifact_list.map(function(artifact) {
    return sign_put_url({
      Bucket:         nconf.get('queue:taskBucket'),
      Key:            taskId + '/runs/' + runId + '/artifacts/' + artifact,
      ContentType:    artifacts[artifact].contentType,
      Expires:        timeout
    });
  });

  // Create a JSON object from signed urls
  var artifact_urls = Promise.all(urls_signed).then(function(signed_urls) {
    var artifactPrefix = taskId + '/runs/' + runId + '/artifacts/';
    var url_map = {};
    artifact_list.forEach(function(artifact, index) {
      url_map[artifact] = {
        artifactPutUrl:       signed_urls[index],
        artifactUrl:          task_bucket_url(artifactPrefix + artifact),
        contentType:          artifacts[artifact].contentType
      };
    });
    return url_map;
  });

  // When loaded reply with task status structure, if found
  return Promise.all(
    task_loaded,
    artifact_urls
  ).spread(function(task_status, url_map) {
    if (task_status) {
      return res.reply({
        status:           task_status,
        expires:          expires.toJSON(),
        artifacts:        url_map
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
  input:    'http://schemas.taskcluster.net/queue/v1/task-completed-request.json#',
  output:   'http://schemas.taskcluster.net/queue/v1/task-completed-response.json#',
  title:    "Report Completed Task",
  desc: [
    "Report task completed..."
  ].join('\n')
}, function(req, res) {
  // Get input from posted JSON
  var taskId        = req.params.taskId;
  var runId         = req.body.runId;
  var workerGroup   = req.body.workerGroup;
  var workerId      = req.body.workerId;
  var success       = req.body.success;

  var task_completed = data.completeTask(taskId);

  return task_completed.then(function(completed) {
    if (!completed) {
      res.json(404, {
        message:    "Task not found"
      });
      return;
    }
    return data.loadTask(taskId).then(function(task_status) {
      // Resolution to be uploaded to S3
      var resolution = {
        version:        '0.2.0',
        status:         task_status,
        resultUrl:      task_bucket_url(taskId + '/runs/' + runId + '/result.json'),
        logsUrl:        task_bucket_url(taskId + '/runs/' + runId + '/logs.json'),
        runId:          runId,
        success:        success,
        workerId:       workerId,
        workerGroup:    workerGroup
      };

      var uploaded_to_s3 = s3.putObject({
        Bucket:               nconf.get('queue:taskBucket'),
        Key:                  taskId + '/resolution.json',
        Body:                 JSON.stringify(resolution),
        ContentType:          'application/json'
      }).promise();

      var event_published = events.publish('task-completed', {
        version:        '0.2.0',
        status:         task_status,
        resultUrl:      task_bucket_url(taskId + '/runs/' + runId + '/result.json'),
        logsUrl:        task_bucket_url(taskId + '/runs/' + runId + '/logs.json'),
        runId:          runId,
        success:        success,
        workerId:       workerId,
        workerGroup:    workerGroup
      });

      return Promise.all(
        uploaded_to_s3,
        event_published
      ).then(function() {
        return res.reply({
          status:     task_status
        });
      });
    });
  });
});

/** Fetch work for a worker */
api.declare({
  method:   'post',
  route:    '/claim-work/:provisionerId/:workerType',
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
  // Get input
  var provisionerId   = req.params.provisionerId;
  var workerType      = req.params.workerType;
  var workerGroup     = req.body.workerGroup;
  var workerId        = req.body.workerId;

  // Load pending tasks
  var task_loaded = data.queryTasks(provisionerId, workerType);

  // When loaded let's pick a pending task
  return task_loaded.then(function(tasks) {
    // if there is no tasks available, report 204
    if (tasks.length == 0) {
      // Ask worker to sleep for 3 min before polling again
      res.json(204, {
        sleep:        3 * 60
      });
      return;
    }

    // Pick the first task
    var task = tasks[0];
    var taskId = task.taskId;

    ///////////// Warning: Code duplication from /task/:taskId/claim
    /////////////          This needs to be refactored, all logic like this
    /////////////          should live in queue/... so it can be reused for new
    /////////////          api versions....

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    var timeout = task.timeout;
    takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

    // Claim task without runId if this is a new claim
    var task_claimed = data.claimTask(taskId, takenUntil, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      runId:          undefined
    });

    // When claimed
    return task_claimed.then(function(runId) {
      // If task wasn't claimed, report 404
      if(runId === null) {
        res.json(404, {
          message: "Task not found, or already taken"
        });
        return;
      }

      // Load task status structure
      return data.loadTask(taskId).then(function(task_status) {
        // Fire event
        var event_sent = events.publish('task-running', {
          version:        '0.2.0',
          workerGroup:    workerGroup,
          workerId:       workerId,
          runId:          runId,
          logsUrl:        task_bucket_url(taskId + '/runs/' + runId + '/logs.json'),
          status:         task_status
        });

        // Sign urls for the reply
        var logs_url_signed = sign_put_url({
          Bucket:         nconf.get('queue:taskBucket'),
          Key:            taskId + '/runs/' + runId + '/logs.json',
          ContentType:    'application/json',
          Expires:        timeout
        });

        // Sign url for uploading task result
        var result_url_signed = sign_put_url({
          Bucket:         nconf.get('queue:taskBucket'),
          Key:            taskId + '/runs/' + runId + '/result.json',
          ContentType:    'application/json',
          Expires:        timeout
        });

        // Send reply client
        var reply_sent = Promise.all(
          logs_url_signed,
          result_url_signed
        ).spread(function(logs_url, result_url) {
          return res.reply({
            runId:          runId,
            logsPutUrl:     logs_url,
            resultPutUrl:   result_url,
            status:         task_status
          });
        });

        // If either of these fails, then I have no idea what to do... so we'll
        // just do them in parallel... a better strategy might developed in the
        // future, this is just a prototype
        return Promise.all(reply_sent, event_sent);
      });
    });
  });
});


/** Rerun a previously resolved task */
api.declare({
  method:     'post',
  route:      '/task/:taskId/rerun',
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
  // Get taskId from parameter
  var taskId = req.params.taskId;

  // Load task.json
  var got_task = s3.getObject({
    Bucket:               nconf.get('queue:taskBucket'),
    Key:                  taskId + '/task.json'
  }).promise().then(function(response) {
    var data = response.data.Body.toString('utf8');
    return JSON.parse(data);
  }, function(err) {
    if (err.code == 'NoSuchKey') {
      return null;
    }
    debug("Failed to get task.json for taskId: %s with error: %s, as JSON: %j",
      err, err, err.stack);
    throw err;
  });

  // Check for resolution
  var got_resolution = s3.getObject({
    Bucket:               nconf.get('queue:taskBucket'),
    Key:                  taskId + '/resolution.json'
  }).promise().then(function(response) {
    var data = response.data.Body.toString('utf8');
    return JSON.parse(data);
  }, function(err) {
    if (err.code == 'NoSuchKey') {
      return null;
    }
    debug("Failed to get resolution for taskId: %s with error: %s, as JSON: %j",
      err, err, err.stack);
    throw err;
  });

  // Load task status from database
  var got_status = data.loadTask(taskId).then(function(task_status) {
    return task_status;
  }, function() {
    return false;
  });

  // When state is loaded check what to do
  return Promise.all(
    got_task,
    got_resolution,
    got_status
  ).spread(function(task, resolution, task_status) {
    // Check that the task exists and have been scheduled before!
    if (task === null) {
      return res.json(400, {
        message:  "Task definition not uploaded and never scheuled!",
        error:    "Couldn't fetch: " + task_bucket_url(taskId + '/task.json')
      });
    }
    if (task_status === false && resolution === false) {
      return res.json(400, {
        message:  "This task have never been scheduled before, can't rerun it",
        error:    "There is no resolution or status for " + taskId
      });
    }

    // Make a promise that task_status is pending again
    var task_status_pending = null;

    // If task_status was deleted from database we create it again
    if (task_status === false) {
      // Restore task status structure from resolution
      task_status = resolution.status;

      // Make the task pending again
      task_status.state       = 'pending';
      task_status.reason      = 'rerun-requested';
      task_status.retries     = task.retries;
      task_status.takenUntil  = (new Date(0)).toJSON();

      // Insert into database
      task_status_pending = data.createTask(task_status).then(function() {
        return task_status;
      })
    } else if (task_status.state == 'running' ||
               task_status.state == 'pending') {
      // If the task isn't resolved, we do nothing letting this function be
      // idempotent
      debug("Attempt to rerun a task with state: '%s' ignored",
            task_status.state);
      return res.reply({
        status:     task_status
      })
    } else {
      // Rerun the task again
      task_status_pending = data.rerunTask(taskId, task.retries);
    }

    // When task is pending again
    return task_status_pending.then(function(task_status) {
      assert(task_status, "task_status cannot be null here!");

      // Reply with created task status
      var sent_reply = res.reply({
        status:   task_status
      });

      // Publish message through events
      var event_published = events.publish('task-pending', {
        version:    '0.2.0',
        status:     task_status
      });

      return Promise.all(sent_reply, event_published);
    });
  });
});


/** Fetch pending tasks */
api.declare({
  method:   'get',
  route:    '/pending-tasks/:provisionerId',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Fetch pending tasks for provisioner",
  desc: [
    "Documented later..."
  ].join('\n')
}, function(req, res) {
  // Get input
  var provisionerId  = req.params.provisionerId;

  // Load pending tasks
  var task_loaded = data.queryTasks(provisionerId);

  // When loaded reply
  task_loaded.then(function(tasks) {
    return res.reply({
      tasks: tasks
    });
  });
});

/** Fetch AMQP Connection String */
api.declare({
  method:   'get',
  route:    '/settings/amqp-connection-string',
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
    url:  nconf.get('amqp:url')
  });
});

