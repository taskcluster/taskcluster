/**
 * The Chain of Trust feature allows tasks to include an artifact that hashes
 * the tasks artifacts and some other pieces of information so that downstream
 * consumers can validate the environment that the task ran in and what was
 * produce. This artifact is then ed25519 signed.
 */
const crypto = require('crypto');
const stream = require('stream');
const tweetnacl = require('tweetnacl');
const Debug = require('debug');
const fs = require('mz/fs');
const streamClosed = require('../stream_closed');
const temporary = require('temporary');
const uploadToS3 = require('../upload_to_s3');
const zlib = require('zlib');
const {fmtErrorLog} = require('../log');

let debug = Debug('taskcluster-docker-worker:features:cot');

class ChainOfTrust {
  constructor() {
    this.featureName = 'chainOfTrust';
  }

  async created(task) {
    this.hash = crypto.createHash('sha256');
    this.ed25519Key = Buffer.from(await new Promise((accept, reject) =>
      fs.readFile(task.runtime.ed25519SigningKeyLocation, 'ascii', (err, data) => err ? reject(err) : accept(data))), 'base64');

    this.file = new temporary.File();
    debug(`created temporary file: ${this.file.path}`);

    // Pipe the task stream to a temp file on disk.
    this.stream = fs.createWriteStream(this.file.path);
    task.stream.on('data', (d) => {
      this.hash.update(d);
    });

    let gzip = zlib.createGzip();
    task.stream.pipe(gzip).pipe(this.stream);
  }

  async killed(task) {
    if (task.isCanceled()) return;

    // Ensure the stream is completely written prior to uploading the temp file.
    await streamClosed(this.stream);

    let expiration = new Date(task.task.expires);

    // Open a new stream to read the entire log from disk (this in theory could
    // be a huge file).
    debug(`ensuring file ${this.file.path} exists and opening read stream`);
    let stat = await fs.stat(this.file.path);
    let logStream = fs.createReadStream(this.file.path);

    try {
      await uploadToS3(task.queue, task.status.taskId, task.runId,
        logStream, 'public/logs/certified.log', expiration, {
          'content-type': 'text/plain',
          'content-length': stat.size,
          'content-encoding': 'gzip'
        });
      await fs.unlink(this.file.path);
    } catch (err) {
      task.stream.write(fmtErrorLog(err));
      await fs.unlink(this.file.path);
      throw err;
    }

    task.artifactHashes['public/logs/certified.log'] = {sha256: `${this.hash.digest('hex')}`};

    let certificate = {
      chainOfTrustVersion: 1,
      artifacts: task.artifactHashes,
      task: task.task,
      taskId: task.status.taskId,
      runId: task.runId,
      workerGroup: task.runtime.workerGroup,
      workerId: task.runtime.workerId,
      environment: {
        publicIpAddress: task.runtime.publicIp,
        privateIpAddress: task.runtime.privateIp,
        imageHash: task.imageHash
      }
    };

    if (task.imageArtifactHash) {
      certificate.environment.imageArtifactHash = task.imageArtifactHash;
    }

    ['instanceId', 'instanceType', 'region'].forEach(tag => {
      if (task.runtime[tag]) {
        certificate.environment[tag] = task.runtime[tag];
      }
    });
    let chainOfTrust = JSON.stringify(certificate, null, 2);
    let chainOfTrustSig = tweetnacl.sign.detached(Buffer.from(chainOfTrust), this.ed25519Key);
    let cotBufferStream = new stream.PassThrough();
    cotBufferStream.end(Buffer.from(chainOfTrust));
    let sigBufferStream = new stream.PassThrough();
    sigBufferStream.end(new Buffer(chainOfTrustSig));

    try {
      await uploadToS3(task.queue, task.status.taskId, task.runId,
        cotBufferStream, 'public/chain-of-trust.json', expiration, {
          'content-type': 'text/plain',
          'content-length': chainOfTrust.length
        });

      await uploadToS3(task.queue, task.status.taskId, task.runId,
        sigBufferStream, 'public/chain-of-trust.json.sig', expiration, {
          'content-type': 'application/octet-stream',
          'content-length': chainOfTrustSig.length
        });
    } catch (err) {
      task.stream.write(fmtErrorLog(err));
      throw err;
    }
  }

}

module.exports = ChainOfTrust;
