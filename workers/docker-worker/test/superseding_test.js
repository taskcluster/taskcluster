const TaskListener = require('../src/lib/task_listener');
const assert = require('assert');
const nock = require('nock');
const Debug = require('debug');

var fakeLog = Debug('fakeRuntime.log');

suite('TaskListener.applySuperseding', function() {
  var listener;
  var claimTaskResponses;
  var SUPERSEDER_URL = "http://supersed.er/superkey";

  class TestTaskListener extends TaskListener {
    constructor(runtime) {
      super(runtime);
    }
  }

  setup(function() {
    claimTaskResponses = {};

    var fakeRuntime = {
      log: fakeLog,
      workerId: 'wkri',
      workerGroup: 'wkrg',
      workerType: 'wkrt',
      provisionerId: 'provid',
      taskQueue: {
        pollInterval: 1,
        expiration: 30000
      },
      task: {
        dequeueCount: 5
      },
      workerTypeMonitor: {
        prefix: () => { }
      },
      deviceManagement: {enabled: false},
      queue: {
        claimTask: async function(taskId, runId, claimConfig) {
          assert.equal(claimConfig.workerId, 'wkri');
          assert.equal(claimConfig.workerGroup, 'wkrg');

          let resp = claimTaskResponses[taskId];
          if (resp) {
            return resp;
          }

          let err = new Error("attempt to claim an unexpected task");
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

  var makeTask = function(supersederUrl) {
    return {
      payload: {
        supersederUrl,
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

  var expectNoSupersederFetch = function() {
    listener.fetchSupersedingTasks = async function(url) {
      throw new Error("this should not be called");
    };
  };

  test("with a claim without a supersederUrl yields that claim",
       async function() {
    var claim = makeClaim('fakeTask', 1, makeTask(null));
    expectNoSupersederFetch();
    assert.deepEqual(await listener.applySuperseding(claim), [claim]);
  });

  test("with a claim with a supersederUrl calls the superseder",
       async function() {
    var task = makeTask(SUPERSEDER_URL);
    var claim = makeClaim('fakeTask', 1, task);
    nock(SUPERSEDER_URL) .get("?taskId=fakeTask")
    .reply(200, {'supersedes': []});
    assert.deepEqual(await listener.applySuperseding(claim), [claim]);
  });

  test("with a claim the superseder knows about claims those tasks too, ordering the claims according to the superseder",
       async function() {
    nock(SUPERSEDER_URL) .get("?taskId=fakeTask")
    .reply(200, {'supersedes': ['cTask1', 'fakeTask', 'cTask2']});
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    claimTaskResponses['cTask2'] = {status: {taskId: 'cTask2'}, runId: 0}
    var task = makeTask(SUPERSEDER_URL);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.applySuperseding(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0], ['cTask2', 0]]);
  });

  test("when the superseder does not return the primary task, just yield the original claim",
       async function() {
    nock(SUPERSEDER_URL) .get("?taskId=fakeTask")
    .reply(200, {'supersedes': ['cTask1', 'cTask2']});
    var task = makeTask(SUPERSEDER_URL);
    var claim = makeClaim('fakeTask', 0, task);
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    assert.deepEqual(await listener.applySuperseding(claim), [claim]);
  });

  test("when the superseder times out, just yield the original claim",
       async function() {
    listener.coalescerTimeout = 100;
    nock(SUPERSEDER_URL) .get("?taskId=fakeTask").delay(400)
    .reply(200, {'supersedes': []});
    var task = makeTask(SUPERSEDER_URL);
    var claim = makeClaim('fakeTask', 0, task);
    assert.deepEqual(await listener.applySuperseding(claim), [claim]);
  });

  test("an error in claiming the secondary claim just omits it",
       async function() {
    nock(SUPERSEDER_URL) .get("?taskId=fakeTask")
    .reply(200, {'supersedes': ['cTask1', 'fakeTask', 'cTask2']});
    claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0}
    var task = makeTask(SUPERSEDER_URL);
    var claim = makeClaim('fakeTask', 0, task);
    var claims = await listener.applySuperseding(claim);
    var claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
    assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0]]);
  });
});
