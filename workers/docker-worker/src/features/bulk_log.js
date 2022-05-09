/**
The bulk logger writes the task stream directly to disk then uploads that file
to s3 after the task has completed running.
*/

const Debug = require('debug');
const fs = require('mz/fs');
const streamClosed = require('../stream_closed');
const { tmpdir } = require('os');
const { mkdtempSync } = require('fs');
const { rm } = require('fs').promises;
const { join, sep } = require('path');
const uploadToS3 = require('../upload_to_s3');
const zlib = require('zlib');

let debug = Debug('taskcluster-docker-worker:features:bulk_log');

let ARTIFACT_NAME = 'public/logs/terminal_bulk.log.gz';

class BulkLog {
  constructor(artifact) {
    this.featureName = 'bulkLogHandler';
    this.artifactName = artifact || ARTIFACT_NAME;
  }

  async created(task) {
    this.tmpDir = mkdtempSync(`${tmpdir()}${sep}`);
    this.tmpFile = 'bulk_log';
    this.filePath = join(this.tmpDir, this.tmpFile);
    debug('Created BulkLog using tempfile: ' + this.filePath);

    // Eventually we want to save the content as gzip on s3 or azure so we
    // incrementally compress it via streams.
    let gzip = zlib.createGzip();

    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.filePath);
    task.stream.pipe(gzip).pipe(this.stream);
  }

  async killed(task) {
    if (task.isCanceled()) {return;}
    //this.stream.end();
    // Ensure the stream is completely written prior to uploading the temp file.
    await streamClosed(this.stream);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    let diskStream = fs.createReadStream(this.filePath);

    // expire the log when the task expires
    let expiration = new Date(task.task.expires);

    try {
      await uploadToS3(task.queue, task.status.taskId, task.runId,
        diskStream, this.artifactName, expiration, {
          'content-type': 'text/plain; charset=utf-8',
          'content-encoding': 'gzip',
        });
    } catch (err) {
      debug(err);
      throw err;
    }

    // Remove temporary directory
    await rm(this.tmpDir, { recursive: true });

    return this.artifactName;
  }

}

module.exports = BulkLog;
