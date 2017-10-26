const assert = require('assert');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('retry intermittent tasks', () => {
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

  test('retry task with specified exit status', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu:latest',
        command: ['/bin/bash', '-c', 'exit 36'],
        maxRunTime: 1 * 60,
        onExitStatus: {
          retry: [36]
        }
      }
    });

    assert.equal(result.run.state, 'pending', 'new pending run should be created');
    assert.equal(result.run.reasonCreated, 'task-retry', 'run should have been created because of task retry');
    assert.equal(result.status.runs.length, 2);
    assert.equal(result.status.runs[0].reasonResolved, 'intermittent-task');
  });

  test('failed task is not retried', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu:latest',
        command: ['/bin/bash', '-c', 'exit 3'],
        maxRunTime: 1 * 60,
        onExitStatus: {
          retry: [36]
        }
      }
    });

    assert.equal(result.run.state, 'failed', 'task should fail');
    assert.equal(result.run.reasonResolved, 'failed', 'task should fail');
    assert.equal(result.status.runs.length, 1);
  });

  test('successful task is not retried', async () => {
    let result = await worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu:latest',
        command: ['/bin/bash', '-c', 'exit 0'],
        maxRunTime: 1 * 60,
        onExitStatus: {
          retry: [36]
        }
      }
    });

    assert.equal(result.run.state, 'completed', 'task should not fail or be retried');
    assert.equal(result.run.reasonResolved, 'completed', 'task should not or be retried');
    assert.equal(result.status.runs.length, 1);
  });
});
