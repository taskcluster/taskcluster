/**
The bulk logger writes the task stream directly to disk then uploads that file
to s3 after the task has completed running.
*/

const Debug = require('debug');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const os = require('os');
const { sep } = require('path');
const streamClosed = require('../stream_closed');
const uploadToS3 = require('../upload_to_s3');
const zlib = require('zlib');

let debug = Debug('taskcluster-docker-worker:features:bulk_log');

let ARTIFACT_NAME = 'public/logs/terminal_bulk.log.gz';

const tmpDir = fs.mkdtempSync(`${os.tmpdir()}${sep}`);
const tmpFile = 'bulk_log';

class BulkLog {
  constructor(artifact) {
    this.featureName = 'bulkLogHandler';
    this.artifactName = artifact || ARTIFACT_NAME;
    this.file = path.join(tmpDir, tmpFile);
    debug('Created BulkLog using tempfile: ' + this.file);
  }

  async created(task) {
    // Eventually we want to save the content as gzip on s3 or azure so we
    // incrementally compress it via streams.
    let gzip = zlib.createGzip();

    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.file);
    task.stream.pipe(gzip).pipe(this.stream);
  }

  async killed(task) {
    if (task.isCanceled()) {return;}
    //this.stream.end();
    // Ensure the stream is completely written prior to uploading the temp file.
    await streamClosed(this.stream);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    let diskStream = fs.createReadStream(this.file);

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

    // Remove the temp dir.
    await fsPromises.rm(tmpDir, { recursive: true });

    return this.artifactName;
  }

}

module.exports = BulkLog;
