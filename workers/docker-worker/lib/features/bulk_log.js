/**
The bulk logger writes the task stream directly to disk then uploads that file
to s3 after the task has completed running.
*/

var streamClosed = require('../stream_closed');
var waitForEvent = require('../wait_for_event');
var temporary = require('temporary');
var fs = require('fs');
var request = require('superagent-promise');
var debug = require('debug')('taskcluster-docker-worker:features:bulk_log');
var fs = require('fs');

var Promise = require('promise');

var ARTIFACT_NAME = 'public/logs/terminal_bulk.log';

function BulkLog() {
  this.file = new temporary.File();
  debug('Created BulkLog using tempfile: ' + this.file.path);
}

BulkLog.prototype = {

  created: function* (task) {
    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.file.path);
    task.stream.pipe(this.stream);
  },

  killed: function* (task) {
    // Ensure the stream is completely written prior to uploading the temp file.
    yield streamClosed(this.stream);

    var queue = task.runtime.queue;

    // Create date when this artifact should expire (see config).
    var expiration =
      new Date(Date.now() + task.runtime.conf.get('logging:bulkLogExpires'));

    var artifact = yield queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      {
        // Why s3? It's currently cheaper to store data in s3 this could easily
        // be used with azure simply by changing s3 -> azure.
        storageType: 's3',
        expires: expiration.toJSON(),
        contentType: 'text/plain'
      }
    );

    var stat = yield fs.stat.bind(fs, this.file.path);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    var diskStream = fs.createReadStream(this.file.path);

    // Stream the entire file to S3 it's important to set the content length and
    // content type (in particular the content-type must be identical to what is
    // sent over in the artifact creation.)
    var req = request.put(artifact.putUrl).set({
      'Content-Type': 'text/plain',
      'Content-Length': stat.size
    });

    // Kick off the stream.
    req.end();

    // Looks weird but pipe should be after .end which creates the raw
    // request. Superagent does a bad job at this =/.
    diskStream.pipe(req);

    // Wait until the request has completed and the file has been uploaded...
    yield waitForEvent(req, 'end');

    // Unlink the temp file.
    yield fs.unlink.bind(fs, this.file.path);
  }

};

module.exports = BulkLog;
