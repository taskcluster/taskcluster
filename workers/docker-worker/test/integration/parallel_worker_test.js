const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const slugid = require('slugid');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const assert = require('assert');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  let workerA, workerB;

  setup(async () => {
    // Each worker should use the same worker type but a unique worker id.
    let workerType = TestWorker.workerTypeName();
    workerA = new TestWorker(DockerWorker, workerType);
    workerB = new TestWorker(DockerWorker, workerType);
    await [workerA.launch(), workerB.launch()];
  });

  teardown(async () => {
    await [workerA.terminate(), workerB.terminate()];
  });

  test('tasks for two workers running in parallel', async () => {
    let taskTpl = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          // Sleep is used to ensure that each worker will get one task
          // (assumption being that both workers are in a running state and can
          // fetch a task in under 5s + overhead)
          'sleep 5',
        ),
        maxRunTime: 60 * 60,
      },
    };
    let taskIds = [slugid.v4(), slugid.v4()];
    workerA.postToQueue(taskTpl, taskIds[0]);
    workerB.postToQueue(taskTpl, taskIds[1]);

    await Promise.all([
      waitForEvent(workerA, 'task resolved'),
      waitForEvent(workerB, 'task resolved'),
    ]);

    let tasks = [];
    for (let taskId of taskIds) {
      let task = await workerA.queue.status(taskId);
      tasks.push(task);
    }

    for (let task of tasks) {
      assert.ok(task.status.runs[0].state, 'completed', 'each task ran successfully');
      assert.ok(task.status.runs[0].reasonResolved, 'completed', 'each task ran successfully');
    }

    assert.notEqual(
      tasks[0].status.runs[0].workerId,
      tasks[1].status.runs[0].workerId,
      'Tasks ran on different workers',
    );
  });
});
