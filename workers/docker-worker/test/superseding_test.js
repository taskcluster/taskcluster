const TaskListener = require('../src/lib/task_listener');
const assert = require('assert');
const nock = require('nock');
const Debug = require('debug');
const monitor = require('./fixtures/monitor');
const {suiteName} = require('taskcluster-lib-testing');

let fakeLog = Debug('fakeRuntime.log');

suite(suiteName(), function() {
  let listener;
  let claimTaskResponses;
  let SUPERSEDER_URL = 'http://supersed.er/superkey/';

  class TestTaskListener extends TaskListener {
    constructor(runtime) {
      super(runtime);
    }
  }

  setup(function() {
    claimTaskResponses = {};

    let fakeRuntime = {
      log: fakeLog,
      workerId: 'wkri',
      workerGroup: 'wkrg',
      workerType: 'wkrt',
      provisionerId: 'provid',
      taskQueue: {
        pollInterval: 1,
        expiration: 30000,
      },
      hostManager: {
        billingCycleUptime: () => 1,
      },
      task: {
        dequeueCount: 5,
      },
      monitor: monitor,
      workerTypeMonitor: monitor,
      deviceManagement: {enabled: false},
      queue: {
        claimTask: async function(taskId, runId, claimConfig) {
          assert.equal(claimConfig.workerId, 'wkri');
          assert.equal(claimConfig.workerGroup, 'wkrg');

          let resp = claimTaskResponses[taskId];
          if (resp) {
            return resp;
          }

          let err = new Error('attempt to claim an unexpected task');
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

  let makeTask = function(supersederUrl) {
    return {
      payload: {
        supersederUrl,
      },
    };
  };

  let makeClaim = function(taskId, runId, task) {
    return {
      status: { taskId: taskId },
      runId,
      task,
    };
  };

  let expectNoSupersederFetch = function() {
    listener.fetchSupersedingTasks = async function(url) {
      throw new Error('this should not be called');
    };
  };

  test('with a claim without a supersederUrl yields that claim',
    async function() {
      let claim = makeClaim('fakeTask', 1, makeTask(null));
      expectNoSupersederFetch();
      assert.deepEqual(await listener.applySuperseding(claim), [claim]);
    });

  test('with a claim with a supersederUrl calls the superseder',
    async function() {
      let task = makeTask(SUPERSEDER_URL);
      let claim = makeClaim('fakeTask', 1, task);
      nock(SUPERSEDER_URL).get('/?taskId=fakeTask')
        .reply(200, {'supersedes': []});
      assert.deepEqual(await listener.applySuperseding(claim), [claim]);
    });

  test('with a claim the superseder knows about claims those tasks too, ordering the claims according to the superseder',
    async function() {
      nock(SUPERSEDER_URL) .get('/?taskId=fakeTask')
        .reply(200, {'supersedes': ['cTask1', 'fakeTask', 'cTask2']});
      claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0};
      claimTaskResponses['cTask2'] = {status: {taskId: 'cTask2'}, runId: 0};
      let task = makeTask(SUPERSEDER_URL);
      let claim = makeClaim('fakeTask', 0, task);
      let claims = await listener.applySuperseding(claim);
      let claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
      assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0], ['cTask2', 0]]);
    });

  test('when the superseder does not return the primary task, just yield the original claim',
    async function() {
      nock(SUPERSEDER_URL) .get('/?taskId=fakeTask')
        .reply(200, {'supersedes': ['cTask1', 'cTask2']});
      let task = makeTask(SUPERSEDER_URL);
      let claim = makeClaim('fakeTask', 0, task);
      claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0};
      assert.deepEqual(await listener.applySuperseding(claim), [claim]);
    });

  test('when the superseder times out, just yield the original claim',
    async function() {
      listener.coalescerTimeout = 100;
      nock(SUPERSEDER_URL) .get('/?taskId=fakeTask').delay(400)
        .reply(200, {'supersedes': []});
      let task = makeTask(SUPERSEDER_URL);
      let claim = makeClaim('fakeTask', 0, task);
      assert.deepEqual(await listener.applySuperseding(claim), [claim]);
    });

  test('an error in claiming the secondary claim just omits it',
    async function() {
      nock(SUPERSEDER_URL) .get('/?taskId=fakeTask')
        .reply(200, {'supersedes': ['cTask1', 'fakeTask', 'cTask2']});
      claimTaskResponses['cTask1'] = {status: {taskId: 'cTask1'}, runId: 0};
      let task = makeTask(SUPERSEDER_URL);
      let claim = makeClaim('fakeTask', 0, task);
      let claims = await listener.applySuperseding(claim);
      let claimedTasks = claims.map(c => [c.status.taskId, c.runId]);
      assert.deepEqual(claimedTasks, [['cTask1', 0], ['fakeTask', 0]]);
    });
});
