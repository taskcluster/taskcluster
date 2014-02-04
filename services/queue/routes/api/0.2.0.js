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

/** API end-point for version 0.2.0 */
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
  input:    'http://schemas.taskcluster.net/api/0.2.0/task-definition.json#',
  output:   'http://schemas.taskcluster.net/api/0.2.0/create-task-response.json#',
  title:    "Create new task",
  desc: [
    "Create a new task, the `status` of the resulting JSON is a task status",
    "structure, you can find the `task_id` in this structure, enjoy."
  ].join('\n')
}, function(req, res) {
  // Create task identifier
  var task_id = uuid.v4();

  // Task status structure to reply with in case of success
  var task_status = {
    task_id:              task_id,
    provisioner_id:       req.body.provisioner_id,
    worker_type:          req.body.worker_type,
    runs:                 [],
    state:                'pending',
    reason:               'none',
    routing:              req.body.routing,
    retries:              req.body.retries,
    priority:             req.body.priority,
    created:              req.body.created,
    deadline:             req.body.deadline,
    taken_until:          (new Date(0)).toJSON()
  };

  // Upload to S3, notice that the schema is validated by middleware
  var uploaded_to_s3 = s3.putObject({
    Bucket:               nconf.get('queue:task-bucket'),
    Key:                  task_id + '/task.json',
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
  route:    '/task/:task_id/status',
  input:    undefined,  // No input is accepted
  output:   undefined,  // TODO: define schema later
  title:    "Get task status",
  desc: [
    "Get task status structure from `task_id`"
  ].join('\n')
}, function(req, res) {
  // Load task
  var task_loaded = data.loadTask(req.param.task_id)

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
  route:    '/task/:task_id/claim',
  input:    undefined,  // TODO: define schema later
  output:   undefined,  // TODO: define schema later
  title:    "Claim task",
  desc: [
    "Claim task, takes worker_group, worker_id and optionally run_id as input",
    "returns task status structure, run_id, result_url and logs_url"
  ].join('\n')
}, function(req, res) {
  // Get the task_id
  var task_id = req.param.task_id;

  // Set taken_until to now + 20 min
  var taken_until = new Date();
  var timeout = 20 * 60;
  taken_until.setSeconds(taken_until.getSeconds() + timeout);

  // Claim task without run_id if this is a new claim
  var task_claimed = data.claimTask(task_id, taken_until, {
    worker_group:   req.body.worker_group,
    worker_id:      req.body.worker_id,
    run_id:         req.body.run_id || undefined
  });

  // When claimed
  task_claimed.then(function(run_id) {
    // If task wasn't claimed, report 404
    if(run_id === null) {
      res.json(404, {
        message: "Task not found, or already taken"
      });
      return;
    }

    // Load task status structure
    return data.loadTask(task_id).then(function(task_status) {
      // Fire event
      var event_sent = events.publish('v1/queue:task-running', {
        version:        '0.2.0',
        worker_group:   req.body.worker_group,
        worker_id:      req.body.worker_id,
        run_id:         run_id,
        logs:           task_bucket_url(task_id + '/logs.json'),
        status:         task_status
      });

      // Sign urls for the reply
      var logs_url_signed = sign_put_url({
        Bucket:         nconf.get('queue:task-bucket'),
        Key:            task_id + '/logs.json',
        ContentType:    'application/json',
        Expires:        timeout
      });

      // Sign url for uploading task result
      var result_url_signed = sign_put_url({
        Bucket:         nconf.get('queue:task-bucket'),
        Key:            task_id + '/result.json',
        ContentType:    'application/json',
        Expires:        timeout
      });

      // Send reply client
      var reply_sent = Promise.all(
        logs_url_signed,
        result_url_signed
      ).spread(function(logs_url, result_url) {
        req.reply({
          worker_group:   req.body.worker_group,
          worker_id:      req.body.worker_id,
          run_id:         run_id,
          logs_url:       logs_url,
          result_url:     result_url,
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
});



/** Get artifact urls */
api.declare({
  method:   'post',
  route:    '/task/:task_id/artifact-urls',
  input:    undefined,  // No input is accepted
  output:   undefined,  // TODO: define schema later
  title:    "Get artifact urls",
  desc: [
    "Get artifact-urls for posted artifact urls..."
  ].join('\n')
}, function(req, res) {
  // Get input from posted JSON
  var task_id       = req.param.task_id;
  var run_id        = req.param.run_id;
  var artifacts     = req.param.artifacts;
  var artifact_list = _.keys(artifacts);

  // Load task
  var task_loaded = data.loadTask(task_id)

  // Let urls timeout after 20 min
  var timeout = 20 * 60;
  var expires = new Date();
  expires.setSeconds(expires.getSeconds() + timeout);

  // Get signed urls
  var urls_signed = artifact_list.map(function(artifact) {
    return sign_put_url({
      Bucket:         nconf.get('queue:task-bucket'),
      Key:            task_id + '/' + run_id + '/artifacts/' + artifact,
      ContentType:    artifacts[artifact],
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
        run_id:         run_id,
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




/*
    POST  /task/<task-id>/completed
    GET   /claim-work/<provisioner-id>/<worker-type>
    GET   /pending-tasks/<provisioner-id>
*/
