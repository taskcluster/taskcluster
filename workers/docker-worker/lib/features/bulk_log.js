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
var fs = require('mz/fs');
var zlib = require('zlib');

var ARTIFACT_NAME = 'public/logs/terminal_bulk.log.gz';

export default class BulkLog {
  constructor(artifact) {

    this.artifactName = artifact || ARTIFACT_NAME;
    this.file = new temporary.File();
    debug('Created BulkLog using tempfile: ' + this.file.path);
  }

  created(task) {
    // Eventually we want to save the content as gzip on s3 or azure so we
    // incrementally compress it via streams.
    var gzip = zlib.createGzip();

    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.file.path);
    task.stream.pipe(gzip).pipe(this.stream);
  }

  async killed(task) {
    if (task.isCanceled()) return;
    //this.stream.end();
    // Ensure the stream is completely written prior to uploading the temp file.
    await streamClosed(this.stream);

    var queue = task.runtime.queue;

    // Create date when this artifact should expire (see config).
    var expiration =
      new Date(Date.now() + task.runtime.logging.bulkLogExpires);

    var artifact = await queue.createArtifact(
      task.status.taskId,
      task.runId,
      this.artifactName,
      {
        // Why s3? It's currently cheaper to store data in s3 this could easily
        // be used with azure simply by changing s3 -> azure.
        storageType: 's3',
        expires: expiration.toJSON(),
        contentType: 'text/plain'
      }
    );

    let stat = await fs.stat(this.file.path);

      // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    var diskStream = fs.createReadStream(this.file.path);

    // Stream the entire file to S3 it's important to set the content length and
    // content type (in particular the content-type must be identical to what is
    // sent over in the artifact creation.)
    var req = request.put(artifact.putUrl).set({
      'Content-Type': 'text/plain',
      'Content-Length': stat.size,
      'Content-Encoding': 'gzip'
    });

    diskStream.pipe(req);
    req.end();

    // Wait until the request has completed and the file has been uploaded...
    var result = await waitForEvent(req, 'end');

    // Unlink the temp file.
    await fs.unlink(this.file.path);

    var url = queue.buildUrl(
      queue.getArtifact,
      task.status.taskId,
      task.runId,
      this.artifactName
    );
    return url;
  }

}
