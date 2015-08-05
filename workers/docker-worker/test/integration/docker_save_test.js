import assert from 'assert';
import base from 'taskcluster-base'
import Docker from 'dockerode-promise';
import dockerOpts from 'dockerode-options';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import * as settings from '../settings';
import tar from 'tar-fs';
import TestWorker from '../testworker';
import waitForEvent from '../../lib/wait_for_event';
import Debug from 'debug';

let debug = Debug('docker-worker:test:docker-save-test');

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

    assert(result.run.state === 'completed', 'task should be successful');
    assert(result.run.reasonResolved === 'completed',
                 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

    let url = `https://queue.taskcluster.net/v1/task/${taskId}/runs/${runId}/artifacts/public/dockerImage.tar`;

    //superagent means no zlib required
    let res = await request.get(url).end();
    res.pipe(fs.createWriteStream('/tmp/dockerload.tar'));
    await waitForEvent(res, 'end');
    //make sure it finishes unzipping
    await base.testing.sleep(2000);

    let docker = new Docker(dockerOpts());
    let imageName = 'task-' + taskId + '-' + runId + ':latest';
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
    await docker.getImage(imageName).remove();
  });

  test('run cacheSave, then check contents', async () => {
    let result = await worker.postToQueue({
      scopes: ['docker-worker:cache:test-cache'],
      payload: {
        image: 'busybox',
        command: ['/bin/sh', '-c', 'echo testString > /tmp/test-cache/test.log'],
        features: {
          dockerSave: true
        },
        maxRunTime: 5 * 60,
        cache: {
          'test-cache': '/tmp/test-cache/'
        }
      }
    });

    assert(result.run.state === 'completed', 'task should be successful');
    assert(result.run.reasonResolved === 'completed',
                 'task should be successful');

    let taskId = result.taskId;
    let runId = result.runId;

    let url = `https://queue.taskcluster.net/v1/task/${taskId}/runs/${runId}/artifacts/public/cache/test-cache.tar`;

    //superagent means no zlib required
    let res = await request.get(url).end();
    let tarStream = tar.extract('/tmp/cacheload');
    res.pipe(tarStream);
    await waitForEvent(res, 'end');
    //so the tar actually finishes extracting; tarStream doesn't have an end event
    await base.testing.sleep(1000);

    let testStr = await fs.readFile('/tmp/cacheload/test.log', {encoding: 'utf-8'});
    assert(testStr == 'testString\n');

    //cleanup temp folder
    await fs.unlink('/tmp/cacheload/test.log');
    await fs.rmdir('/tmp/cacheload');
  });
});
