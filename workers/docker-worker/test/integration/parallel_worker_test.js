const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const slugid = require('slugid');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('Parallel workers', () => {
  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  // Total of number of tasks to run...
  var PARALLEL_TOTAL = 2;

  var workerA, workerB;

  setup(async () => {
    // Each worker should use the same worker type but a unique worker id.
    var workerType = `dummy-type-${slugid.v4()}`.substring(0,22);
    workerA = new TestWorker(DockerWorker, workerType);
    workerB = new TestWorker(DockerWorker, workerType);
    await [workerA.launch(), workerB.launch()];
  });

  teardown(async () => {
    await [workerA.terminate(), workerB.terminate()];
  });

  test('tasks for two workers running in parallel', async () => {
    var taskTpl = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          // Sleep is used to ensure that each worker will get one task
          // (assumption being that both workers are in a running state and can
          // fetch a task in under 5s + overhead)
          'sleep 5'
        ),
        maxRunTime: 60 * 60
      }
    };
    var taskIds = [slugid.v4(), slugid.v4()];
    workerA.postToQueue(taskTpl, taskIds[0]);
    workerB.postToQueue(taskTpl, taskIds[1]);

    await Promise.all([
      waitForEvent(workerA, 'task resolved'),
      waitForEvent(workerB, 'task resolved')
    ]);

    var tasks = []
    for (var taskId of taskIds) {
      var task = await workerA.queue.status(taskId);
      tasks.push(task);
    }

    for (var task of tasks) {
      assert.ok(task.status.runs[0].state, 'completed', 'each task ran successfully');
      assert.ok(task.status.runs[0].reasonResolved, 'completed', 'each task ran successfully');
    }

    assert.notEqual(
      tasks[0].status.runs[0].workerId,
      tasks[1].status.runs[0].workerId,
      'Tasks ran on different workers'
    );
  });
});

