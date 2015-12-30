suite('Reclaimer', function() {
  var assert = require('assert');
  var Reclaimer = require('../lib/task').Reclaimer;
  var fakeRuntime, fakeTask;
  var reclaims;
  var taskAction;
  var soon;
  var reclaimer;
  var fakeLog = require('debug')('fakeRuntime.log');

  setup(function() {
    reclaims = [];
    taskAction = null;

    fakeRuntime = {
      task: {
        // soon is in 1 minute, so this reclaimDivisor means reclaim every 6s
        reclaimDivisor: 10,
      },
      queue: {
        reclaimTask: async function(taskId, runId) {
          reclaims.push({taskId, runId});
          var newTakenUntil = new Date();
          newTakenUntil.setMinutes(soon.getMinutes() + 1);
          return makeClaim(taskId, runId, newTakenUntil);
        },
      },
      log: fakeLog,
    };

    fakeTask = {
      cancel: function(exception, message) {
        taskAction = {action: 'cancel', exception, message};
      },
      abort: function(reason) {
        taskAction = {action: 'abort', reason};
      },
    };

    soon = new Date();
    soon.setMinutes(soon.getMinutes() + 1);

    reclaimer = null;
  });

  teardown(function() {
    if (reclaimer) {
      reclaimer.stop();
    }
  });

  var makeClaim = function(taskId, runId, takenUntil) {
    return {
      status: { taskId: taskId },
      runId,
      takenUntil,
    }
  };

  test("successful reclaim", async function() {
    var claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, [{taskId: 'fakeTid', runId: 0}]);
    assert.equal(taskAction, null);
  });

  test("reclaim after stop does nothing", async function() {
    var claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);
    reclaimer.stop()

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction, null);
  });

  test("primary reclaim that fails with a 409 cancels the task", async function() {
    var claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    fakeRuntime.queue.reclaimTask = async function(taskId, runId) {
      var err = new Error("uhoh");
      err.statusCode = 409;
      throw err;
    };

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction.action, 'cancel');
  });

  test("primary reclaim that fails with a 401 aborts the task", async function() {
    var claim = makeClaim('fakeTid', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, claim);

    fakeRuntime.queue.reclaimTask = async function(taskId, runId) {
      var err = new Error("uhoh");
      err.statusCode = 401;
      throw err;
    };

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction.action, 'abort');
  });

  test("non-primary reclaim that fails has no effect except to stop reclaims",
       async function() {
    var claim = makeClaim('fakeTid', 0, soon);
    var secondClaim = makeClaim('fakeTid2', 0, soon);
    reclaimer = new Reclaimer(fakeRuntime, fakeTask, claim, secondClaim);

    fakeRuntime.queue.reclaimTask = async function(taskId, runId) {
      var err = new Error("uhoh");
      err.statusCode = 409;
      throw err;
    };

    await reclaimer.reclaimTask();
    assert.deepEqual(reclaims, []);
    assert.equal(taskAction, null);
    assert.equal(reclaimer.stopped, true);
  });

  // the scheduled reclaims are adequately tested in integration tests
});
