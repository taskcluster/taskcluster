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

  var workerA, workerB, workerType = slugid.v4();
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
        image: 'ubuntu',
        command: cmd(
          // Sleep is used to ensure that each worker will get one task
          // (assumption being that both workers are in a running state and can
          // fetch a task in under 5s + overhead)
          'sleep 5'
        ),
        maxRunTime: 60 * 60
      }
    };

    var tasks = yield {
      a: workerA.postToQueue(taskTpl),
      b: workerB.postToQueue(taskTpl)
    };

    for (var key in tasks) {
      assert.ok(tasks[key].run.success, 'each task ran successfully');
    }

    assert.notEqual(
      tasks.a.run.workerId,
      tasks.b.run.workerId,
      'Tasks ran on different workers'
    );
  }));
});

