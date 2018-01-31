const { ZSTD_TASK_ID } = require('./image_artifacts.js');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const mime = require('mime');
const taskcluster = require('taskcluster-client');
const uploadToS3 = require('../../src/lib/upload_to_s3');
const artifactDownload = require('../../src/lib/util/artifact_download');

function removeFile(filename) {
  try {
    fs.unlinkSync(filename);
  } catch(e) {} // eslint-disable-line no-empty
}

function createQueue() {
  return new taskcluster.Queue({
    timeout: 3 * 1000,
    credentials: {
      clientId: process.env.TASKCLUSTER_CLIENT_ID,
      accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN
    }
  });
}

function uncompressZstFile(file) {
  return new Promise((resolve, reject) => {
    const zst = spawn('unzstd', [file]);
    zst.stdout.on('data', console.log);
    zst.stderr.on('data', console.log);
    zst.on('exit', code => {
      code
        ? reject(new Error(`unzstd exited with code ${code}`))
        : resolve();
    });
  });
}

function compressFile(file) {
  return new Promise((resolve, reject) => {
    const lz4 = spawn('lz4c', ['-9', file, `${file}.lz4`]);
    lz4.stdout.on('data', console.log);
    lz4.stderr.on('data', console.log);
    lz4.on('exit', code => {
      code
        ? reject(new Error(`lz4c exited with code ${code}`))
        : resolve();
    });
  });
}

function scheduleReclaim(queue, claim) {
  const takenFor = (new Date(claim.takenUntil) - new Date());
  const nextReclaim = takenFor / 1000;

  return setTimeout(async () => {
    try {
      claim = await queue.reclaimTask(
        claim.status.taskId,
        claim.runId
      );
    } catch (e) {} // eslint-disable-line no-empty
  }, nextReclaim);
}

async function main() {
  const zstImagePath = '/tmp/image.tar.zst';
  const lz4ImagePath = '/tmp/image.tar.lz4';
  const tarImagePath = zstImagePath.replace(path.extname(zstImagePath), '');

  const queue = createQueue();

  removeFile(zstImagePath);
  removeFile(tarImagePath);
  removeFile(lz4ImagePath);

  console.log(`Downloading image artifact from ${ZSTD_TASK_ID}`);
  await artifactDownload(
    queue,
    process.stdout,
    ZSTD_TASK_ID,
    'public/image.tar.zst',
    zstImagePath
  );
  const zstFileSizeInMB = fs.statSync(zstImagePath).size / (1024*1024);
  console.log(`Image downloaded at ${zstImagePath}, size = ${zstFileSizeInMB} MB`);

  await uncompressZstFile(zstImagePath);

  console.log('Image uncompressed, creating lz4 image');
  await compressFile(tarImagePath);
  console.log('lz4 image created successfully, creating task');

  const taskId = taskcluster.slugid();
  await queue.createTask(taskId, {
    provisionerId: 'null-provisioner',
    workerType: 'docker-worker',
    created: new Date().toJSON(),
    deadline: taskcluster.fromNowJSON('1 hour'),
    expires: taskcluster.fromNowJSON('40 years'),
    metadata: {
      name: 'lz4-docker-image',
      description: 'Task with a lz4 compressed docker image for docker-worker tests',
      owner: 'wcosta@mozilla.com',
      source: 'https://www.mozilla.org'
    },
    payload: {}
  });

  console.log(`Task ${taskId} created successfullly, claiming`);
  const claim = await queue.claimTask(taskId, 0, {
    workerGroup: 'docker-worker',
    workerId: 'docker-worker'
  });

  const lz4Stat = fs.statSync(lz4ImagePath);
  const lz4FileSizeInMB = lz4Stat.size / (1024*1024);
  const timeoutId = scheduleReclaim(queue, claim);
  console.log(`Uploading lz4 image, size = ${lz4FileSizeInMB} MB`);

  await uploadToS3(
    queue,
    taskId,
    0,
    fs.createReadStream(lz4ImagePath),
    'public/image.tar.lz4',
    taskcluster.fromNowJSON('30 years'),
    {
      'content-type': mime.lookup(lz4ImagePath),
      'content-length': lz4Stat.size
    },
    null,
    {}
  );

  clearTimeout(timeoutId);
  await queue.reportCompleted(taskId, 0);
  const status = (await queue.status(taskId)).status;
  console.log(`Task ${taskId} exited with status "${status.runs[0].state}"`);
}

main().catch(err => console.log(err.stack));
