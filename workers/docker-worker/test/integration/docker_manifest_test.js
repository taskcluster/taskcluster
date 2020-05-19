const assert = require('assert');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const TestWorker = require('../testworker');
const DockerWorker = require('../dockerworker');
const {suiteName} = require('taskcluster-lib-testing');
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
        image: 'tutum/curl',
        artifacts: {
          'public/image.tar.zst': {
            type: 'file',
            expires: expires(),
            path: '/image.tar.zst',
          },
        },
        command: [
          'curl',
          '-o',
          '/image.tar.zst',
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
});
