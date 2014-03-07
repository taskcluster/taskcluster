var Promise       = require('promise');
var request       = require('superagent');
var debug         = require('debug')('worker');
var queue         = require('./queue');
var TaskRun       = require('./taskrun');

/**
 * Create a worker with options as:
 * `{provisionerId, workerType, workerGroup, workerId}`
 */
var Worker = function(options) {
  if (!options.provisionerId  ||
      !options.workerType     ||
      !options.workerGroup    ||
      !options.workerId) {
    debug("Failed to create Worker Instance, keys in options are missing!");
    throw new Error(
      "Options must specify provisionerId, workerType, workerGroup and " +
      "workerId"
    );
  }
  this.provisionerId  = options.provisionerId;
  this.workerType     = options.workerType;
  this.workerGroup    = options.workerGroup;
  this.workerId       = options.workerId;
  debug("Created Worker instance with options: %j", options);
};


/**
 * Claim a task from queue and fetch it, returns a promise for a `TaskRun`
 * instance, if no tasks is available the promise gives `null`. The promise only
 * fails, if it failed to contact the queue, download task, etc.
 */
Worker.prototype.claimWork = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    // Create claim-work URL
    var url = queue.queueUrl(
      '/claim-work/' + that.provisionerId + '/' +
      that.workerType
    );

    // First /claim-work/...
    request
      .post(url)
      .send({
        workerGroup:    that.workerGroup,
        workerId:       that.workerId
      })
      .end(function(res) {
        if (res.status == 200) {
          accept({claimedTask: true, reply: res.body});
        } else if (res.status == 204) {
          accept({claimedTask: false, reply: res.body});
        } else {
          debug(
            "Failed to /claim-work/..., error: %s, as JSON: %j",
            res.text, res.body
          );
          reject(res.text);
        }
      });
  }).then(function(result) {
    if (!result.claimedTask) {
      return null;
    }
    return new Promise(function(accept, reject) {
      // Then we fetch the tasks from S3
      var url = 'http://tasks.taskcluster.net/' + result.reply.status.taskId +
                '/task.json';
      request
        .get(url)
        .end(function(res) {
          if(res.ok) {
            debug("Task definition loaded for %s", result.reply.status.taskId);
            accept(res.body);
          } else {
            debug("Failed to fetch task.json from tasks.taskcluster.net");
            reject();
          }
        });
    }).then(function(task) {
      // Create instance of TaskRun and return it
      return new TaskRun(
        that,
        task,
        result.reply.status,
        result.reply.runId,
        result.reply.logsPutUrl,
        result.reply.resultPutUrl
      );
    });
  });
};

// Export Worker
module.exports = Worker
