import assert from 'assert';
import slugid from 'slugid';

import cmd from './helper/cmd';
import expires from './helper/expires';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('use dind-service', () => {
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

  test('run docker in docker', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/dind-test:v1',
        command: [
          'docker', 'run', '--rm', 'busybox:buildroot-2014.02',
          'busybox', '--help'
        ],
        features: {
          dind: true
        },
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed',
                 'task should be successful');
    assert.ok(result.log.indexOf('BusyBox is a multi-call binary') !== -1,
              'Expected to see busybox --help message');
  });

  test('Build and index image', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/dind-test:v1',
        routes: "index.garbage.docker-worker-tests.docker-images." + slugid.v4(),
        command: cmd(
          "mkdir artifacts",
          "docker pull busybox:buildroot-2014.02",
          "docker save busybox:buildroot-2014.02 > /artifacts/image.tar"
        ),
        features: {
          dind: true
        },
        maxRunTime: 5 * 60,
        artifacts: {
          'public/image.tar': {
            type: 'file',
            expires: expires(),
            path: '/artifacts/image.tar'
          }
        }
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed',
                 'task should be successful');
  });
});
