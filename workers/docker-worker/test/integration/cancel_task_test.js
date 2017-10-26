const assert = require('assert');
const slugid = require('slugid');
const settings = require('../settings');
const taskcluster = require('taskcluster-client');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('Cancel Task', () => {
  test('cancel', async () => {
    settings.configure({
      task: {
        // just use crazy high reclaim divisor... This will result in way to
        // frequent reclaims but allow us to easily test that it reclaims at
        // least once...
        reclaimDivisor: 1000,
        dequeueCount: 15
      }
    });

    let queue = new taskcluster.Queue();
    let task = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command:        [
          '/bin/bash', '-c', 'echo "Hello"; sleep 60; echo "done";'
        ],
        features: {
          localLiveLog: false
        },
        maxRunTime: 60 * 60
      }
    };
    let taskId = slugid.v4();
    let worker = new TestWorker(DockerWorker);
    let canceledTask;
    worker.on('task run', async () => await queue.cancelTask(taskId));
    worker.on('cancel task', () => canceledTask = true);
    await worker.launch();
    let result = await worker.postToQueue(task, taskId);
    await worker.terminate();
    assert.ok(canceledTask, 'task execution should have been canceled');
    assert.equal(result.run.reasonResolved, 'canceled', 'Task not marked as canceled');
  });
});
