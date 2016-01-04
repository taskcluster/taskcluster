suite('TaskListener.coalesceClaim', function() {
  var assert = require('assert');
  var nock = require('nock');
  var TaskListener = require('../lib/task_listener');
  var fakeLog = require('debug')('fakeRuntime.log');
  var listener;
  var claimTaskResponses, coalescerResponses, coalescerCalls;
  var COALESCER_URL = "http://coalesc.er/";

  class TestTaskListener extends TaskListener {
    constructor(runtime) {
      this.runtime = runtime;
      // don't initialize anything else
    }
  }

  setup(function() {
    claimTaskResponses = {};
    coalescerResponses = {};
    coalescerCalls = [];

    var fakeRuntime = {
      log: fakeLog,
      workerId: 'wkri',
      workerGroup: 'wkrg',
      queue: {
        claimTask: async function(taskId, runId, claimConfig) {
          assert.equal(claimConfig.workerId, 'wkri');
          assert.equal(claimConfig.workerGroup, 'wkrg');

          let resp = claimTaskResponses[taskId];
          if (resp) {
            return resp;
          }

          let err = new Error("uhoh");
          err.statusCode = 409;
          throw err;
        },
      },
    };

    listener = new TestTaskListener(fakeRuntime);
  });

  teardown(function() {
    assert.deepEqual(nock.pendingMocks(), []);
  });

  var makeTask = function(coalescer, routes) {
    return {
      routes,
      payload: {
        coalescer,
      },
    };
  };

  var makeClaim = function(taskId, runId, task) {
    return {
      status: { taskId: taskId },
      runId,
      task,
    }
  };

  var expectNoCoalescerFetch = function() {
    listener.fetchCoalescerTasks = async function(url) {
      throw new Error("this should not be called");
    };
  };

  test("coalescing a claim without a coalescer yields that claim",
       async function() {
    var claim = makeClaim('fakeTask', 1, makeTask(null, []));
    expectNoCoalescerFetch();
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
  });

  test("coalescing a claim with a coalescer but no matching routes yields that claim",
       async function() {
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['foo.bar']);
    var claim = makeClaim('fakeTask', 1, task);
    expectNoCoalescerFetch();
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
  });

  test("coalescing a claim with a coalescer but two matching routes yields that claim",
       async function() {
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a', 'coalesce.v1.b']);
    var claim = makeClaim('fakeTask', 1, task);
    expectNoCoalescerFetch();
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
  });

  test("coalescing a claim with a coalescer and one route calls the coalescer",
       async function() {
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a']);
    var claim = makeClaim('fakeTask', 1, task);
    nock(COALESCER_URL) .get("/a").reply(200, {'a': []});
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
  });

  test("coalescing a claim the coalescer knows about claims those tasks too, in order",
       async function() {
    nock(COALESCER_URL) .get("/a").reply(200, {'a': ['cTask1', 'fakeTask', 'cTask2']});
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    claimTaskResponses['cTask2'] = {status: {taskId: 'cTask2'}, runId: 0}
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.coalesceClaim(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['cTask2', 0], ['fakeTask', 0]]);
  });

  test("when the coalescer does not return the primary task, claim the new tasks anyway, but return the original claim",
       async function() {
    nock(COALESCER_URL) .get("/a").reply(200, {'a': ['cTask1', 'cTask2']});
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    claimTaskResponses['cTask2'] = {status: {taskId: 'cTask2'}, runId: 0}
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.coalesceClaim(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['cTask2', 0], ['fakeTask', 0]]);
  });

  test("when the coalescer times out, just yield the original claim",
       async function() {
    listener.coalescerTimeout = 100;
    nock(COALESCER_URL) .get("/a").delay(400).reply(200, {'a': []});
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    assert.deepEqual(await listener.coalesceClaim(claim), [claim]);
  });

  test("an error in claiming the secondary claim just omits it",
       async function() {
    nock(COALESCER_URL) .get("/a").reply(200, {'a': ['cTask1', 'fakeTask', 'cTask2']});
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    var task = makeTask({url: COALESCER_URL, routePrefix: "coalesce.v1"}, ['coalesce.v1.a']);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.coalesceClaim(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0]]);
  });
});
