var Promise       = require('promise');
var request       = require('superagent-promise');
var fs            = require('fs');
var mime          = require('mime');
var debug         = require('debug')('taskrun');
var assert        = require('assert');
var queue         = require('./queue');


// XXX: This code should live in the client not in the worker
function handleRequestError(res) {
  if (res.error) {
    // XXX: we can (and actually do) better in the client...
    throw res.error;
  }
}

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
  var taskId = this.status.taskId;
  var url = queue.queueUrl('/task/' + taskId + '/claim');

  return request
    .post(url)
    .send({
      workerGroup:      this.owner.workerGroup,
      workerId:         this.owner.workerId,
      runId:            this._runId
    })
    .end()
    .then(function(res) {
      if (res.error) {
        debug("Failed to reclaim task: %s", taskId, res.text);
        throw res.error;
      }

      debug("Successfully, reclaimed task: %s", taskId);
      this.status         = res.body.status;
      this._logsPutUrl    = res.body.logsPutUrl;
      this._resultPutUrl  = res.body.resultPutUrl;
    }.bind(this));
};

/**
 * Keep task by reclaiming task from queue before `takenUntil` expires,
 * until `taskCompleted()` or `clearKeepTask()` is called.
 *
 * The optional argument `abortCallback` will be called if a reclaim fails.
 */
TaskRun.prototype.keepTask = function(abortCallback) {
  // Function to reclaim and set reclaim timeout again
  var reclaim = function() {
    this.reclaimTask().
      then(setReclaimTimeout).
      catch(function(err) {
        console.error('Error while attempting to issue claim');
        console.error(err.stack);

        // TODO: This is a little aggressive, we should allow it to fail a few
        // times before we abort... And we should check the error code, 404
        // Task not found, means task completed or canceled, in which case we
        // really should abort immediately
        abortCallback && abortCallback();
      });
  }.bind(this);

  var setReclaimTimeout = function() {
    // calculate when (in absolute time) when to issue the claim
    var takenUntil = new Date(this.status.takenUntil);

    // calculate the time in milliseconds from now. Default to now if its in the
    // past.
    var nextTick = Math.max((takenUntil.valueOf() - Date.now()) * 0.7, 0);
    debug('rescheduling reclaim', { nextTick: nextTick });
    this._reclaimTimeoutHandle = setTimeout(reclaim, nextTick);

  }.bind(this);

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
  debug('Uploading logs.json to signed PUT URL');
  return request
           .put(this._logsPutUrl)
           .send(json)
           .end()
           .then(handleRequestError);
};

/** Put result.json for current run, returns promise of success */
TaskRun.prototype.putResult = function(json) {
  debug("Uploading result.json to PUT URL");
  return request
    .put(this._resultPutUrl)
    .send(json)
    .end()
    .then(handleRequestError);
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
    return request
      .post(url)
      .send({
        workerGroup:      that.owner.workerGroup,
        workerId:         that.owner.workerId,
        runId:            that._runId,
        artifacts:        artifacts
      })
      .end()
      .then(function(res) {
        if (res.error) {
          debug("Failed get a signed artifact URL, errors: %s", res.text);
          throw res.error;
        }
        debug("Got signed artifact PUT URL from queue");
        var artifactUrls = res.body.artifacts[name];
        var req = request
                    .put(artifactUrls.artifactPutUrl)
                    .set('Content-Type',    contentType)
                    .set('Content-Length',  stat.size);
        fs.createReadStream(filename).pipe(req, {end: false});
        return req.end().then(function(res) {
          if (!res.ok) {
            debug("Failed to upload to signed artifact PUT URL");
            return reject(res.text);
          }
          debug("Successfully uploaded artifact %s to PUT URL", name);
          accept(artifactUrls[name].artifactUrl);
        });
      });
  });
};

TaskRun.prototype.getArtifactPutUrls = function(artifacts) {
  // Construct request URL for fetching signed artifact PUT URLs
  var url = queue.queueUrl('/task/' + this.status.taskId + '/artifact-urls');

  // Request artifact put urls
  return request
    .post(url)
    .send({
      workerGroup:      this.owner.workerGroup,
      workerId:         this.owner.workerId,
      runId:            this._runId,
      artifacts:        artifacts
    })
    .end()
    .then(function(res) {
      if (res.error) {
        debug("Failed get a signed artifact URL, errors: %s", res.text);
        throw res.error;
      }
      debug("Got signed artifact PUT URL from queue");
      return res.body.artifacts;
    });
};


/** Report task completed, returns promise of success */
TaskRun.prototype.taskCompleted = function() {
  this.clearKeepTask();

  var url = queue.queueUrl('/task/' + this.status.taskId + '/completed');
  return request
    .post(url)
    .send({
      workerGroup:      this.owner.workerGroup,
      workerId:         this.owner.workerId,
      runId:            this._runId
    })
    .end()
    .then(function(res) {
      if (res.error) {
        debug("Failed to report task as completed, error code: %s", res.status);
        throw res.error;
      }
      debug("Successfully reported task completed");
    });
};

// Export TaskRun
module.exports = TaskRun;
