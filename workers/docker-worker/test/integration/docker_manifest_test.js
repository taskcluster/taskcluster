const assert = require('assert');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const waitTaskCompletion = require('./helper/wait_task_completion');
const TestWorker = require('../testworker');
const DockerWorker = require('../dockerworker');
const slugid = require('slugid');
const debug = require('debug')('docker-worker:test:docker-manifest');

suite('docker image with manifest.json file', function() {

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
    assert.equal(task2.run.reasonResolved, 'completed', 'task should be successful');

    let task2 = await worker.postToQueue({
      payload: {
        image: {
          path: 'public/image.tar.zst',
          type: 'task-image',
          taskId: imageTaskId,
        },
        command: cmd('sleep 1'),
        maxRunTime: 5 * 60,
      },
    });

    assert.equal(task2.run.state, 'completed', 'task should be successful');
    assert.equal(task2.run.reasonResolved, 'completed', 'task should be successful');
  });
});
