const assert = require('assert');
const base = require('taskcluster-base');
const Docker = require('dockerode-promise');
const dockerOpts = require('dockerode-options');
const DockerWorker = require('../dockerworker');
const fs = require('mz/fs');
const https = require('https');
const got = require('got');
const settings = require('../settings');
const tar = require('tar-fs');
const TestWorker = require('../testworker');
const Debug = require('debug');
const {removeImage} = require('../../src/lib/util/remove_image');
const pipe = require('promisepipe');

let debug = Debug('docker-worker:test:docker-save-test');

function createImageName(taskId, runId) {
  return `${taskId.toLowerCase().replace(/[_-]/g, '0')}-${runId}`;
}

suite('use docker-save', () => {
  let worker;
  setup(async () => {
    worker = new TestWorker(DockerWorker);
    await worker.launch();
  });
  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  });

  test('run dockerSave, then check contents', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test.log'],
        features: {
          dockerSave: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

    let url = `https://queue.taskcluster.net/v1/task/${taskId}/runs/${runId}/artifacts/public/dockerImage.tar`;

    let res = got.stream(url);
    const tarStream = fs.createWriteStream('/tmp/dockerload.tar');
    await pipe(res, tarStream);
    //make sure it finishes unzipping
    await base.testing.sleep(2000);

    let docker = new Docker(dockerOpts());
    let imageName = createImageName(taskId, runId);
    await docker.loadImage('/tmp/dockerload.tar');
    let opts = {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['cat', '/tmp/test.log'],
      Image: imageName
    };
    let streamOpts = {
      logs: true,
      stdout: true,
    };
    let container = await docker.createContainer(opts);
    await container.start();
    let stream = await container.attach(streamOpts);

    await new Promise((accept, reject) => {
      stream.on('data', (data) => {
        assert(data.compare(new Buffer(0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x0b, //header
          0x74,0x65,0x73,0x74,0x53,0x74,0x72,0x69,0x6e,0x67,0x0a))); //testString\n
        accept();
      });
      stream.on('error', reject);
      // stream.on('end', () => {reject(new Error('stream ended too early'))});
      setTimeout(reject, 15000, new Error('timed out waiting for docker container'));
    });
    await base.testing.sleep(100);
    await Promise.all([container.remove(), fs.unlink('/tmp/dockerload.tar')]);
    await removeImage(docker, imageName);
  });

  test('run cacheSave, then check contents', async () => {
    let result = await worker.postToQueue({
      scopes: ['docker-worker:cache:docker-worker-garbage-caches-test-cache'],
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test-cache/test.log'],
        features: {
          dockerSave: true
        },
        maxRunTime: 5 * 60,
        cache: {
          'docker-worker-garbage-caches-test-cache': '/tmp/test-cache/'
        }
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

    let url = `https://queue.taskcluster.net/v1/task/${taskId}/runs/${runId}/artifacts/public/cache/docker-worker-garbage-caches-test-cache.tar`;

    let res = got.stream(url);
    let tarStream = tar.extract('/tmp/cacheload');
    await pipe(res, tarStream);
    //so the tar actually finishes extracting; tarStream doesn't have an end event
    await base.testing.sleep(1000);

    let testStr = await fs.readFile('/tmp/cacheload/test.log', {encoding: 'utf-8'});
    assert.equal(testStr, 'testString\n');

    //cleanup temp folder
    await fs.unlink('/tmp/cacheload/test.log');
    await fs.rmdir('/tmp/cacheload');
  });
});
