/**
 * This module spawns an instance of the worker, then submits a given task for
 * this automatically generated workerType and listens for the task completion
 * event.
 */

var LocalWorker = require('./localworker');
var queue       = require('../queue');
var uuid        = require('uuid');
var Promise     = require('promise');
var request     = require('superagent');
var Listener    = require('./listener');
var debug       = require('debug')('docker-worker:test:testworker');

/** Test provisioner id, don't change this... */
exports.TEST_PROVISIONER_ID = 'jonasfj-auto-test-prov';

/** Wait for a message, fetch result and stop listening */
var waitForResult = function(listener) {
  return new Promise(function(accept, reject) {
    listener.once('message', function(message) {
      // Stop listening
      listener.destroy();
      // Accept message
      accept(message);
    });
  }).then(function(message) {
    // Request the result.json from resultUrl in completion message
    var got_result = new Promise(function(accept, reject) {
      request
        .get(message.resultUrl)
        .end(function(res) {
          if (res.ok) {
            accept(res.body);
          } else {
            debug("Failed to get result.json from task completion message");
            reject(res.text);
          }
        });
    });

    // Request the logs.json from resultUrl in completion message
    var got_logs = new Promise(function(accept, reject) {
      request
        .get(message.logsUrl)
        .end(function(res) {
          if (res.ok) {
            accept(res.body);
          } else {
            debug("Failed to get logs.json from task completion message");
            reject(res.text);
          }
        });
    });

    // Return a promise for logs and result
    return Promise.all(got_result, got_logs);
  }).then(function(results) {
    return {
      result: results[0],
      logs:   results[1]
    };
  });
};

/** This will submit a task with given payload to a worker instance running
 * locally and wait for the result to be published to S3. Then fetch the
 * result from S3 and return it from the promise.
 *
 * This is accomplished by posting task with provisionerId,
 * `jonasfj-auto-test-prov` with a UUID for workerType, so that we're
 * sure the task will only be picked up by our local worker.
 */
exports.submitTaskAndGetResults = function(payload) {
  // We'll use a uuid but slash it to 22 chars as we only allow 22 chars for
  // workerType. If we wanted, we could fit a full UUID in there by using the
  // slugid encoding as employed by the queue... But this is just for testing
  // so we don't care.
  var workerType = uuid.v4().substr(22);

  // Start listening for a result from the worker type
  var listener = new Listener(workerType);
  var started_listening = listener.listen();

  // Post task to queue
  var task_posted = started_listening.then(function() {
    return queue.postTask(payload, {
      provisionerId:    exports.TEST_PROVISIONER_ID,
      workerType:       workerType,
      owner:            'unknown@localhost.local',
      name:             'Task from docker-worker test suite',
      deadline:         1
    });
  });

  // Create local worker and launch it
  var worker = new LocalWorker(workerType);
  var worker_running = task_posted.then(function() {
    return worker.launch();
  });

  // Wait for a result to be posted
  var got_result = worker_running.then(function() {
    return waitForResult(listener);
  });

  // Kill worker when we've got the result
  return got_result.then(function(result) {
    worker.terminate();
    return result;
  }, function(err) {
    worker.terminate();
    debug("Got error in testworker: %s as JSON: %j", err, err);
    throw err;
  });
};

