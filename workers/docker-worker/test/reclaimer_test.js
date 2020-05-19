const assert = require('assert');
const Reclaimer = require('../src/lib/task').Reclaimer;
const fakeLog = require('debug')('fakeRuntime.log');
const EventEmitter = require('events');
const {suiteName} = require('taskcluster-lib-testing');

suite(suiteName(), function() {
  let fakeRuntime, fakeTask;
  let reclaims;
  let taskAction;
  let soon;
  let reclaimer;

  let makeClaim = function(taskId, runId, takenUntil) {
    return {
      status: { taskId: taskId },
      runId,
      takenUntil,
    };
  };

  setup(function() {
    reclaims = [];
    taskAction = null;

    let fakeReclaimTask = async function(taskId, runId) {
      reclaims.push({taskId, runId});
      let newTakenUntil = new Date();
      newTakenUntil.setMinutes(soon.getMinutes() + 1);
      return makeClaim(taskId, runId, newTakenUntil);
    };

    class FakeTask extends EventEmitter {
      constructor() {
        super();
        this.queue = { reclaimTask: fakeReclaimTask };
      }

      createQueue(credentials, runtime) {
        return this.queue;
      }

      cancel(exception, message) {
        taskAction = {action: 'cancel', exception, message};
      }

      abort(reason) {
        taskAction = {action: 'abort', reason};
      }
    }

    fakeRuntime = {
      task: {
        // soon is in 1 minute, so this reclaimDivisor means reclaim every 6s
        reclaimDivisor: 10,
      },
      queue: {
        reclaimTask: fakeReclaimTask,
      },
      log: fakeLog,
    };

    fakeTask = new FakeTask();

    soon = new Date();
    soon.setMinutes(soon.getMinutes() + 1);

    reclaimer = null;
  });

  teardown(function() {
    if (reclaimer) {
      reclaimer.stop();
    }
  });

  test('successful reclaim', async function() {
    let claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, [{taskId: 'fakeTid', runId: 0}]);
    assert.equal(taskAction, null);
  });

  test('credentials update event emitted', async function() {
    let claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    let updated = false;
    fakeTask.on('credentials', credentials => {
      updated = true;
    });

    await reclaimer.reclaimTask();
    assert.equal(taskAction, null);

    // Wait a tick to make sure the event is processed
    await new Promise((accept) => process.nextTick(() => accept()));

    assert.ok(updated);
  });

  test('reclaim after stop does nothing', async function() {
    let claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);
    reclaimer.stop();

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction, null);
  });

  test('primary reclaim that fails with a 409 cancels the task', async function() {
    let claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    let failReclaimTask = async function(taskId, runId) {
      let err = new Error('uhoh');
      err.statusCode = 409;
      throw err;
    };

    fakeRuntime.queue.reclaimTask = failReclaimTask;
    fakeTask.queue.reclaimTask = failReclaimTask;

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction.action, 'cancel');
  });

  test('primary reclaim that fails with a 401 aborts the task', async function() {
    let claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    let failReclaimTask = async function(taskId, runId) {
      let err = new Error('uhoh');
      err.statusCode = 401;
      throw err;
    };

    fakeRuntime.queue.reclaimTask = failReclaimTask;
    fakeTask.queue.reclaimTask = failReclaimTask;

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction.action, 'abort');
  });

  test('non-primary reclaim that fails has no effect except to stop reclaims',
    async function() {
      let claim = makeClaim('fakeTid', 0, soon);
      let secondClaim = makeClaim('fakeTid2', 0, soon);
      reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, secondClaim);

      let failReclaimTask = async function(taskId, runId) {
        let err = new Error('uhoh');
        err.statusCode = 409;
        throw err;
      };

      fakeRuntime.queue.reclaimTask = failReclaimTask;
      fakeTask.queue.reclaimTask = failReclaimTask;

      await reclaimer.reclaimTask();
      assert.deepEqual(reclaims, []);
      assert.equal(taskAction, null);
      assert.equal(reclaimer.stopped, true);
    });

  // the scheduled reclaims are adequately tested in integration tests
});
