var Promise       = require('promise');
var request       = require('superagent');
var fs            = require('fs');
var mime          = require('mime');
var debug         = require('debug')('taskrun');
var assert        = require('assert');
var queue         = require('./queue');

/**
 * Minimum time remaining until `takenUntil` expires before reclaim is
 * initialized, if `keepTask()` is used.
 */
var RECLAIM_TIME = 1000 * 60 * 3;

/**
 * Create a new TaskRun instance, this class help you keep a task run, upload
 * artifacts, supply `logs.json` and report result when the task is completed.
 */
var TaskRun = function(owner, task, status, runId, logsPutUrl, resultPutUrl) {
  assert(owner,         "has owner Worker object");
  assert(task,          "has task definition");
  assert(status,        "has task status");
  assert(runId,         "has runId");
  assert(logsPutUrl,    "has logs.json PUT URL");
  assert(resultPutUrl,  "has result.json PUT URL");
  this.owner                  = owner;
  this.status                 = status;
  this.task                   = task;
  this._runId                 = runId;
  this._logsPutUrl            = logsPutUrl;
  this._resultPutUrl          = resultPutUrl;
  this._reclaimTimeoutHandle  = null;
};

/**
 * Reclaim task for current run, returns a promise of success
 *
 * **Note**, consider using `keepTask()` and `clearKeepTask()` instead of
 * reimplementing the timing logic.
 */
TaskRun.prototype.reclaimTask = function() {
  var that = this;
  var taskId = that.status.taskId;
  return new Promise(function(accept, reject) {
    var url = queue.queueUrl('/task/' + taskId + '/claim');
    request
      .post(url)
      .send({
        workerGroup:      that.owner.workerGroup,
        workerId:         that.owner.workerId,
        runId:            that._runId
      })
      .end(function(res) {
        if (!res.ok) {
          debug("Failed to reclaim task: %s", taskId);
          return reject();
        }
        debug("Successfully, reclaimed task: %s", taskId);
        that.status         = res.body.status;
        that._logsPutUrl    = res.body.logsPutUrl;
        that._resultPutUrl  = res.body.resultPutUrl;
        accept();
      });
  });
};

/**
 * Keep task by reclaiming task from queue before `takenUntil` expires,
 * until `taskCompleted()` or `clearKeepTask()` is called.
 *
 * The optional argument `abortCallback` will be called if a reclaim fails.
 */
TaskRun.prototype.keepTask = function(abortCallback) {
  var that = this;
  var reclaim = null;
  // Function to set reclaim timeout
  var setReclaimTimeout = function() {
    that._reclaimTimeoutHandle = setTimeout(reclaim,
      (new Date(that.status.takenUntil)).getTime() -
      (new Date()).getTime() - RECLAIM_TIME
    );
  };
  // Function to reclaim and set reclaim timeout again
  reclaim = function() {
    that.reclaimTask().then(setReclaimTimeout, function() {
      // TODO: This is a little aggressive, we should allow it to fail a few
      // times before we abort... And we should check the error code, 404
      // Task not found, means task completed or canceled, in which case we
      // really should abort immediately
      if (abortCallback) {
        abortCallback();
      }
    });
  };
  // Set reclaim time out
  setReclaimTimeout();
};

/** Stop reclaiming from the queue before `takenUntil` expires */
TaskRun.prototype.clearKeepTask = function() {
  if(this._reclaimTimeoutHandle) {
    clearTimeout(this._reclaimTimeoutHandle);
    this._reclaimTimeoutHandle = null;
  }
};


/** Put logs.json for current run, returns promise of success */
TaskRun.prototype.putLogs = function(json) {
  var that = this;
  return new Promise(function(accept, reject) {
    debug("Uploading logs.json to signed PUT URL");
    request
      .put(that._logsPutUrl)
      .send(json)
      .end(function(res) {
        if (!res.ok) {
          debug("Failed to upload logs.json, error: %s", res.text)
          return reject();
        }
        debug("Successfully, uploaded logs.json");
        accept();
      });
  });
};

/** Put result.json for current run, returns promise of success */
TaskRun.prototype.putResult = function(json) {
  var that = this;
  return new Promise(function(accept, reject) {
    debug("Uploading result.json to PUT URL");
    request
      .put(that._resultPutUrl)
      .send(json)
      .end(function(res) {
        if (!res.ok) {
          debug("Failed to upload logs.json, error: %s", res.text)
          return reject();
        }
          debug("Successfully, uploaded result.json");
          accept();
      });
  });
};

/**
 * Put artifact from file, returns promise for a URL to the uploaded artifact
 *
 * If the optional contentType isn't provided, Content-Type will be deduced from
 * filename.
 */
TaskRun.prototype.putArtifact = function(name, filename, contentType) {
  var that = this;
  return new Promise(function(accept, reject) {
    // Test that specified file exists
    var stat = fs.stat(filename, function(err, stat) {
      if (err) {
        return reject(err);
      }
      if(!stat.isFile()) {
        return reject(new Error("No such file: " + filename));
      }
      accept(stat);
    });
  }).then(function(stat) {
    return new Promise(function(accept, reject) {
      // Lookup mimetype if not provided
      if (!contentType) {
        contentType = mime.lookup(filename);
      }

      // Create artifacts map to submit
      var artifacts = {};
      artifacts[name] = {
        contentType:       contentType
      };

      // Construct request URL for fetching signed artifact PUT URLs
      var url = queue.queueUrl('/task/' + that.status.taskId + '/artifact-urls');

      // Request artifact put urls
      request
        .post(url)
        .send({
          workerGroup:      that.owner.workerGroup,
          workerId:         that.owner.workerId,
          runId:            that._runId,
          artifacts:        artifacts
        })
        .end(function(res) {
          if (!res.ok) {
            debug("Failed get a signed artifact URL, errors: %s", res.text);
            return reject(res.text);
          }
          debug("Got signed artifact PUT URL from queue");
          var req = request
                      .put(res.body.artifactPutUrls[name])
                      .set('Content-Type',    contentType)
                      .set('Content-Length',  stat.size);
          fs.createReadStream(filename).pipe(req, {end: false});
          req.end(function(res) {
            if (!res.ok) {
              debug("Failed to upload to signed artifact PUT URL");
              return reject(res.text);
            }
            debug("Successfully uploaded artifact %s to PUT URl", name);
            var artifactUrl = 'http://tasks.taskcluster.net/' +
                              that.status.taskId + '/runs/' + that._runId +
                              '/artifacts/' + name;
            accept(artifactUrl);
          });
        });
    });
  });
};

/** Report task completed, returns promise of success */
TaskRun.prototype.taskCompleted = function() {
  this.clearKeepTask();
  var that = this;
  return new Promise(function(accept, reject) {
    var url = queue.queueUrl('/task/' + that.status.taskId + '/completed');
    request
      .post(url)
      .send({
        workerGroup:      that.owner.workerGroup,
        workerId:         that.owner.workerId,
        runId:            that._runId
      })
      .end(function(res) {
        if (!res.ok) {
          debug("Failed to report task as completed, error code: %s", res.status);
          return reject(res.text);
        }
        debug("Successfully reported task completed");
        accept();
      });
  });
};

// Export TaskRun
module.exports = TaskRun;