/**
The bulk logger writes the task stream directly to disk then uploads that file
to s3 after the task has completed running.
*/

var debug = require('debug')('taskcluster-docker-worker:features:bulk_log');
var fs = require('mz/fs');
var https = require('https');
var streamClosed = require('../stream_closed');
var temporary = require('temporary');
var uploadToS3 = require('../upload_to_s3');
var url = require('url');
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

    let stat = await fs.stat(this.file.path);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    let diskStream = fs.createReadStream(this.file.path);
    let expiration = new Date(Date.now() + task.runtime.logging.bulkLogExpires);

    try {
      await uploadToS3(task, diskStream, this.artifactName, expiration, {
        'content-type': 'text/plain',
        'content-length': stat.size,
        'content-encoding': 'gzip'
      });
    } catch (err) {
      debug(err);
      throw err;
    };


    // Unlink the temp file.
    await fs.unlink(this.file.path);

    var queue = task.runtime.queue;

    return queue.buildUrl(
      queue.getArtifact,
      task.status.taskId,
      task.runId,
      this.artifactName
    );
  }

}
