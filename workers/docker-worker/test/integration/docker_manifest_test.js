const assert = require('assert');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const TestWorker = require('../testworker');
const DockerWorker = require('../dockerworker');
const { suiteName } = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

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

  test('docker manifest', async () => {

    let task1 = await worker.postToQueue({
      payload: {
        image: 'curlimages/curl',
        artifacts: {
          'public/image.tar.zst': {
            type: 'file',
            expires: expires(),
            path: '/tmp/image.tar.zst',
          },
        },
        command: [
          'curl',
          '-o',
          '/tmp/image.tar.zst',
          '-L',
          'https://s3-us-west-2.amazonaws.com/docker-worker-manifest-test/image.tar.zst',
        ],
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(task1.run.state, 'completed', 'task should be successful');
    assert.equal(task1.run.reasonResolved, 'completed', 'task should be successful');

    let task2 = await worker.postToQueue({
      payload: {
        image: {
          path: 'public/image.tar.zst',
          type: 'task-image',
          taskId: task1.taskId,
        },
        command: cmd('sleep 1'),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(task2.run.state, 'completed', 'task should be successful');
    assert.equal(task2.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('docker manifest v1.2 only', async () => {

    let task1 = await worker.postToQueue({
      payload: {
        image: 'curlimages/curl',
        artifacts: {
          'public/image.tar.zst': {
            type: 'file',
            expires: expires(),
            path: '/tmp/image.tar.zst',
          },
        },
        command: [
          'curl',
          '-o',
          '/tmp/image.tar.zst',
          '-L',
          // This image is the busybox image build from https://hg.mozilla.org/try/rev/b76a6f5b3a26211da5ea1fa6a86329f921a302b7
          // It is a docker image built with kaniko based on `FROM busybox`, with the workaround we have been using for
          // https://github.com/taskcluster/taskcluster/issues/2973 turned off.
          'https://s3-us-west-2.amazonaws.com/docker-worker-manifest-test/image-v1_2.tar.zst',
        ],
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(task1.run.state, 'completed', 'task should be successful');
    assert.equal(task1.run.reasonResolved, 'completed', 'task should be successful');

    let task2 = await worker.postToQueue({
      payload: {
        image: {
          path: 'public/image.tar.zst',
          type: 'task-image',
          taskId: task1.taskId,
        },
        command: cmd('sleep 1'),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(task2.run.state, 'completed', 'task should be successful');
    assert.equal(task2.run.reasonResolved, 'completed', 'task should be successful');
  });
});
