const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const mime = require('mime');
const taskcluster = require('taskcluster-client');
const uploadToS3 = require('../../src/lib/upload_to_s3');
const Docker = require('dockerode-promise');

function removeFile(filename) {
  try {
    fs.unlinkSync(filename);
  } catch(e) {} // eslint-disable-line no-empty
}

function createQueue() {
  // expects rootUrl and credentials in env vars
  return new taskcluster.Queue({
    timeout: 30 * 1000,
    ...taskcluster.fromEnvVars(),
  });
}

function scheduleReclaim(queue, claim) {
  const reclaim = async () => {
    try {
      claim = await queue.reclaimTask(
        claim.status.taskId,
        claim.runId
      );

      const takenFor = (new Date(claim.takenUntil) - new Date());
      const nextReclaim = takenFor / 200;

      setTimeout(reclaim, nextReclaim);
    } catch (e) {} // eslint-disable-line no-empty
  };

  setTimeout(reclaim, 10);
}

function run(name, args) {
  console.log(`Running "${name} ${args.join(' ')}"`);
  return new Promise((accept, reject) => {
    const proc = spawn(name, args, {stdio: 'inherit'});

    proc.on('close', code => code
      ? reject(new Error(`${name} exited with code ${code}`))
      : accept()
    );
  });

}

async function main() {
  const IMAGE_NAME = 'ubuntu:18.04';
  const lz4ImagePath = '/tmp/image.tar.lz4';
  const zstImagePath = '/tmp/image.tar.zst';
  const tarImagePath = '/tmp/image.tar';

  const queue = createQueue(taskcluster.fromEnvVars());
  const docker = new Docker();

  removeFile(tarImagePath);
  removeFile(lz4ImagePath);

  await docker.pull(IMAGE_NAME);

  // dockerode has no save method
  await run('docker', ['save', '-o', tarImagePath, IMAGE_NAME]);
  await run('lz4c', ['-9', tarImagePath, lz4ImagePath]);
  await run('zstd', [tarImagePath, '-f', '-o', zstImagePath]);

  const taskId = taskcluster.slugid();
  await queue.createTask(taskId, {
    provisionerId: 'null-provisioner',
    workerType: 'docker-worker',
    created: new Date().toJSON(),
    deadline: taskcluster.fromNowJSON('1 hour'),
    expires: taskcluster.fromNowJSON('70 years'),
    retries: 0,
    routes: [
      'index.garbage.docker-worker-tests.docker-images',
    ],
    metadata: {
      name: 'docker-worker test images',
      description: 'Task with docker images for docker-worker tests',
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

  scheduleReclaim(queue, claim);

  await Promise.all([tarImagePath, lz4ImagePath, zstImagePath].map(image => {
    const stat = fs.statSync(image);
    const sizeInMB = stat.size / (1024*1024);
    const imageName = path.basename(image).toLowerCase();

    console.log(`Uploading ${imageName}, size = ${sizeInMB}MB`);

    const p = Promise.all(['public', 'private/docker-worker-tests'].map(scope => {
      return uploadToS3(
        queue,
        taskId,
        0,
        fs.createReadStream(image),
        `${scope}/${imageName}`,
        taskcluster.fromNowJSON('60 years'),
        {
          'content-type': mime.lookup(image),
          'content-length': stat.size
        },
        null,
        {}
      );
    }));

    console.log(`${imageName} uploaded`);

    return p;
  }));

  await queue.reportCompleted(taskId, 0);
  const status = (await queue.status(taskId)).status;
  console.log(`Task ${taskId} exited with status "${status.runs[0].state}"`);
}

main().catch(err => console.log(err.stack));
