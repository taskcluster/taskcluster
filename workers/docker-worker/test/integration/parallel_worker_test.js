suite('Parallel workers', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  // Total of number of tasks to run...
  var PARALLEL_TOTAL = 2;

  var workerA, workerB;
  var workerType = `test_worker_${slugid.v4()}`.substring(0,22);

  setup(co(function * () {
    // Each worker should use the same worker type but a unique worker id.
    workerA = new TestWorker(DockerWorker, workerType, slugid.v4());
    workerB = new TestWorker(DockerWorker, workerType, slugid.v4());
    yield [workerA.launch(), workerB.launch()];
  }));

  teardown(co(function* () {
    yield [workerA.terminate(), workerB.terminate()];
  }));

  test('tasks for two workers running in parallel', co(function* () {
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

    yield [
      waitForEvent(workerA, 'task resolved'),
      waitForEvent(workerB, 'task resolved')
    ];

    var tasks = []
    for (var taskId of taskIds) {
      var task = yield workerA.queue.status(taskId);
      tasks.push(task);
    }
    console.log(JSON.stringify(tasks));

    for (var task of tasks) {
      assert.ok(task.status.runs[0].state, 'completed', 'each task ran successfully');
      assert.ok(task.status.runs[0].reasonResolved, 'completed', 'each task ran successfully');
    }

    assert.notEqual(
      tasks[0].status.runs[0].workerId,
      tasks[1].status.runs[0].workerId,
      'Tasks ran on different workers'
    );
  }));
});

