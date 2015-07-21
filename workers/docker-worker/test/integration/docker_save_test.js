import assert from 'assert';
import base from 'taskcluster-base'
import Docker from 'dockerode-promise';
import dockerOpts from 'dockerode-options';
import DockerWorker from '../dockerworker';
import fs from 'mz/fs';
import https from 'https';
import request from 'superagent-promise';
import TestWorker from '../testworker';
import zlib from 'zlib';
// import Debug from 'debug';

// let debug = Debug('docker-worker:test:docker-save-test');

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

  test('run, then check contents', async () => {
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

    try {
      //superagent was only downlading 16K of data
      await new Promise((accept, reject) => {
        https.request(url, (res) => { //take the redirect
          https.request(res.headers.location, (res) => {
            let unzipStream = zlib.Gunzip();
            res.pipe(unzipStream).pipe(fs.createWriteStream('/tmp/dockerload.tar'));
            unzipStream.on('end', accept);
            res.on('error', (err) => reject(err));
          }).end();
          res.on('error', (err) => reject(err));
        }).end();
      });

      let docker = new Docker(dockerOpts());
      let imageName = 'task/' + taskId + '/' + runId + ':latest';
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
      let finished = false;
      stream.on('data', (data) => {
        assert(data.compare(new Buffer(0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x0b, //header
          0x74,0x65,0x73,0x74,0x53,0x74,0x72,0x69,0x6e,0x67,0x0a))); //testString\n
        finished = true;
      });
      await base.testing.sleep(5000);
      assert(finished, 'did not receive any data back');
      await Promise.all([container.remove(), fs.unlink('/tmp/dockerload.tar')]);
      await docker.getImage(imageName).remove();
    } catch (e) {
      console.log(e);
      if(e.stack) console.log(e.stack);
      throw e;
    }
  });
});
