var nconf   = require('nconf');
var utils   = require('./utils');
var uuid    = require('uuid');
var Promise = require('promise');
var aws     = require('aws-sdk');
var _       = require('lodash');
var debug   = require('debug')('routes:api:0.2.0');

var data    = require('../../queue/data');
var events  = require('../../queue/events');

// Create S3 instance
var s3 = new aws.S3();

/** API end-point for version v1/ */
var api = module.exports = new utils.API({
  limit:          '10mb'
});

/** Get the url to a prefix within the task-bucket */
var task_bucket_url = function(prefix) {
  return 'https://s3-' + nconf.get('aws:region') + '.amazonaws.com/' +
          nconf.get('queue:task-bucket') + '/' + prefix;
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
  input:    'http://schemas.taskcluster.net/v1/task.json#',
  output:   'http://schemas.taskcluster.net/v1/create-task-response.json#',
  title:    "Create new task",
  desc: [
    "Create a new task, the `status` of the resulting JSON is a task status",
    "structure, you can find the `taskId` in this structure, enjoy."
  ].join('\n')
}, function(req, res) {
  // Create task identifier
  var taskId = uuid.v4();

  // Task status structure to reply with in case of success
  var task_status = {
    taskId:               taskId,
    provisionerId:        req.body.provisionerId,
    workerType:           req.body.workerType,
    runs:                 [],
    state:                'pending',
    reason:               'none',
    routing:              req.body.routing,
    retries:              req.body.retries,
    priority:             req.body.priority,
    created:              req.body.created,
    deadline:             req.body.deadline,
    takenUntil:           (new Date(0)).toJSON()
  };

  // Upload to S3, notice that the schema is validated by middleware
  var uploaded_to_s3 = s3.putObject({
    Bucket:               nconf.get('queue:task-bucket'),
    Key:                  taskId + '/task.json',
    Body:                 JSON.stringify(req.body),
    ContentType:          'application/json'
  }).promise();

  // When upload is completed
  var done = uploaded_to_s3.then(function() {

    // Insert into database
    var added_to_database = data.createTask(task_status);

    // Publish message through events
    var event_published = events.publish('v1/queue:task-pending', {
      version:    '0.2.0',
      status:     task_status
    });

    // Return a promise that everything happens
    return Promise.all(added_to_database, event_published);
  })

  // Reply to request, when task is uploaded to s3, added to database and
  // published over RabbitMQ
  done.then(function() {
    // Reply that the task was inserted
    res.reply({
      status: task_status
    });
  }, function(err) {
    debug("Failed to accept new task, error: %s as JSON: %j", err, err);
    // Report internal error
    res.json(500, {
      message:                "Internal Server Error"
    });
  });
});


/** Get task status */
api.declare({
  method:   'get',
  route:    '/task/:taskId/status',
  input:    undefined,  // No input is accepted
  output:   undefined,  // TODO: define schema later
  title:    "Get task status",
  desc: [
    "Get task status structure from `taskId`"
  ].join('\n')
}, function(req, res) {
  // Load task
  var task_loaded = data.loadTask(req.params.taskId)

  // When loaded reply with task status structure, if found
  task_loaded.then(function(task_status) {
    if (task_status) {
      res.reply({
        status:     task_status
      });
    } else {
      res.json(404, {
        message:      "Task not found or already resolved"
      });
    }
  }, function(err) {
    debug("Failed to load task, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
    });
  });
});


/** Claim task */
api.declare({
  method:   'post',
  route:    '/task/:taskId/claim',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Claim task",
  desc: [
    "Claim task, takes workerGroup, workerId and optionally runId as input",
    "returns task status structure, runId, resultPutUrl and logsPutUrl"
  ].join('\n')
}, function(req, res) {
  // Get the taskId
  var taskId = req.params.taskId;

  // Set takenUntil to now + 20 min
  var takenUntil = new Date();
  var timeout = 20 * 60;
  takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

  // Claim task without runId if this is a new claim
  var task_claimed = data.claimTask(taskId, takenUntil, {
    workerGroup:    req.body.workerGroup,
    workerId:       req.body.workerId,
    runId:          req.body.runId || undefined
  });

  // When claimed
  task_claimed.then(function(runId) {
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
      var event_sent = events.publish('v1/queue:task-running', {
        version:        '0.2.0',
        workerGroup:    req.body.workerGroup,
        workerId:       req.body.workerId,
        runId:          runId,
        logsUrl:        task_bucket_url(taskId + '/' + runId + '/logs.json'),
        status:         task_status
      });

      // Sign urls for the reply
      var logs_url_signed = sign_put_url({
        Bucket:         nconf.get('queue:task-bucket'),
        Key:            taskId + '/runs/' + runId + '/logs.json',
        ContentType:    'application/json',
        Expires:        timeout
      });

      // Sign url for uploading task result
      var result_url_signed = sign_put_url({
        Bucket:         nconf.get('queue:task-bucket'),
        Key:            taskId + '/runs/' + runId + '/result.json',
        ContentType:    'application/json',
        Expires:        timeout
      });

      // Send reply client
      var reply_sent = Promise.all(
        logs_url_signed,
        result_url_signed
      ).spread(function(logs_url, result_url) {
        res.reply({
          workerGroup:    req.body.workerGroup,
          workerId:       req.body.workerId,
          runId:          runId,
          logsPutUrl:     logs_url,
          resultPutUrl:   result_url,
          status:         task_status
        });
      }, function(err) {
        debug("Failed to reply to claim, error: %s as JSON: %j", err, err);
        res.json(500, {
          message:        "Internal Server Error"
        });
      });

      // If either of these fails, then I have no idea what to do... so we'll
      // just do them in parallel... a better strategy might developed in the
      // future, this is just a prototype
      return Promise.all(reply_sent, event_sent);
    });
  }).then(undefined, function(err) {
    debug("Failed to claim task, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
    });
  });
});



/** Get artifact urls */
api.declare({
  method:   'post',
  route:    '/task/:taskId/artifact-urls',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
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
      Bucket:         nconf.get('queue:task-bucket'),
      Key:            taskId + '/runs/' + runId + '/artifacts/' + artifact,
      ContentType:    artifacts[artifact].contentType,
      Expires:        timeout
    });
  });

  // Create a JSON object from signed urls
  var artifact_urls = Promise.all(urls_signed).then(function(signed_urls) {
    var url_map = {};
    artifact_list.forEach(function(artifact, index) {
      url_map[artifact] = signed_urls[index];
    });
    return url_map;
  });

  // When loaded reply with task status structure, if found
  Promise.all(
    task_loaded,
    artifact_urls
  ).spread(function(task_status, url_map) {
    if (task_status) {
      res.reply({
        status:         task_status,
        runId:          runId,
        expires:        expires.toJSON(),
        artifact_urls:  url_map
      });
    } else {
      res.json(404, {
        message:      "Task not found or already resolved"
      });
    }
  }, function(err) {
    debug("Failed to sign-urls for artifacts, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
    });
  });
});


/** Report task as completed */
api.declare({
  method:   'post',
  route:    '/task/:taskId/completed',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
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

  var task_completed = data.completeTask(taskId);

  task_completed.then(function(success) {
    if (!success) {
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
        resultUrl:      task_bucket_url(taskId + '/' + runId + '/result.json'),
        logsUrl:        task_bucket_url(taskId + '/' + runId + '/logs.json'),
        workerId:       workerId,
        workerGroup:    workerGroup
      };

      var uploaded_to_s3 = s3.putObject({
        Bucket:               nconf.get('queue:task-bucket'),
        Key:                  taskId + '/resolution.json',
        Body:                 JSON.stringify(resolution),
        ContentType:          'application/json'
      }).promise();

      var event_published = events.publish('v1/queue:task-completed', {
        version:        '0.2.0',
        status:         task_status,
        resultUrl:      task_bucket_url(taskId + '/' + runId + '/result.json'),
        logsUrl:        task_bucket_url(taskId + '/' + runId + '/logs.json'),
        runId:          runId,
        workerId:       workerId,
        workerGroup:    workerGroup
      });

      return Promise.all(uploaded_to_s3, event_published).then(function() {
        res.reply({
          status:     task_status
        });
      });
    });
  }).then(undefined, function(err) {
    debug("Failed to complete task, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
    });
  });
});


/** Fetch work for a worker */
api.declare({
  method:   'get',
  route:    '/claim-work/:provisionerId/:workerType',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Claim work for a worker",
  desc: [
    "Documented later..."
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
  task_loaded.then(function(tasks) {
    // if there is no tasks available, report 204
    if (tasks.length == 0) {
      // Ask worker to sleep for 3 min before polling again
      res.json(204, {
        sleep:        3 * 60
      });
      return;
    }

    // Pick the first task
    var taskId = tasks[0].taskId;

    ///////////// Warning: Code duplication from /task/:taskId/claim
    /////////////          This needs to be refactored, all logic like this
    /////////////          should live in queue/... so it can be reused for new
    /////////////          api versions....

    // Set takenUntil to now + 20 min
    var takenUntil = new Date();
    var timeout = 20 * 60;
    takenUntil.setSeconds(takenUntil.getSeconds() + timeout);

    // Claim task without runId if this is a new claim
    var task_claimed = data.claimTask(taskId, takenUntil, {
      workerGroup:    workerGroup,
      workerId:       workerId,
      runId:          undefined
    });

    // When claimed
    task_claimed.then(function(runId) {
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
        var event_sent = events.publish('v1/queue:task-running', {
          version:        '0.2.0',
          workerGroup:    workerGroup,
          workerId:       workerId,
          runId:          runId,
          logsUrl:        task_bucket_url(taskId + '/' + runId + '/logs.json'),
          status:         task_status
        });

        // Sign urls for the reply
        var logs_url_signed = sign_put_url({
          Bucket:         nconf.get('queue:task-bucket'),
          Key:            taskId + '/runs/' + runId + '/logs.json',
          ContentType:    'application/json',
          Expires:        timeout
        });

        // Sign url for uploading task result
        var result_url_signed = sign_put_url({
          Bucket:         nconf.get('queue:task-bucket'),
          Key:            taskId + '/runs/' + runId + '/result.json',
          ContentType:    'application/json',
          Expires:        timeout
        });

        // Send reply client
        var reply_sent = Promise.all(
          logs_url_signed,
          result_url_signed
        ).spread(function(logs_url, result_url) {
          res.reply({
            workerGroup:    workerGroup,
            workerId:       workerId,
            runId:          runId,
            logsPutUrl:     logs_url,
            resultPutUrl:   result_url,
            status:         task_status
          });
        }, function(err) {
          debug("Failed to reply to claim, error: %s as JSON: %j", err, err);
          res.json(500, {
            message:        "Internal Server Error"
          });
        });

        // If either of these fails, then I have no idea what to do... so we'll
        // just do them in parallel... a better strategy might developed in the
        // future, this is just a prototype
        return Promise.all(reply_sent, event_sent);
      });
    });
  }, function(err) {
    debug("Failed to complete task, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
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
    res.reply({
      tasks: tasks
    });
  }, function(err) {
    debug("Failed to complete task, error %s, as JSON: %j", err, err);
    res.json(500, {
      message:        "Internal Server Error"
    });
  });
});

