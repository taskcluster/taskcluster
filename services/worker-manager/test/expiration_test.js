const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {WorkerPool, Worker} = require('../src/data');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('expireWorkerPools', function() {
    const makeWP = async values => {
      const workerPool = WorkerPool.fromApi({
        description: 'wp',
        config: {},
        owner: 'me',
        emailOnError: false,
        ...values,
      });
      await workerPool.create(helper.db);
    };

    const checkWP = async workerPoolId => {
      return WorkerPool.fromDbRows(
        await helper.db.fns.get_worker_pool_with_capacity(workerPoolId));
    };

    setup(function() {
      helper.load.remove('expireWorkerPools');
    });

    test('scan of empty set of worker pools', async function() {
      await helper.load('expireWorkerPools');
    });

    test('worker pool with an active providerId', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'testing'});
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider but previousProviderIds', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: ['something']});
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider and empty previousProviderIds', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: []});
      await helper.load('expireWorkerPools');
      assert.equal(await checkWP('pp/wt'), undefined);
    });
  });

  suite('expireWorkers', function() {
    const makeWorker = async values => {
      const worker = Worker.fromApi({
        workerPoolId: 'pp/wt',
        workerGroup: 'wg',
        workerId: 'wid',
        providerId: 'testing',
        capacity: 1,
        state: 'running',
        providerData: {},
        ...values,
      });
      await worker.create(helper.db);
    };

    const checkWorker = async (workerPoolId = 'pp/wt', workerGroup = 'wg', workerId = 'wid') => {
      return await Worker.get(helper.db, {workerPoolId, workerGroup, workerId});
    };

    setup(function() {
      helper.load.remove('expireWorkers');
    });

    test('scan of empty set of workers', async function() {
      await helper.load('expireWorkers');
    });

    test('active worker', async function() {
      await makeWorker({expires: taskcluster.fromNow('1 hour')});
      await helper.load('expireWorkers');
      assert(await checkWorker());
    });

    test('expired worker', async function() {
      await makeWorker({expires: taskcluster.fromNow('-1 hour')});
      await helper.load('expireWorkers');
      assert.equal(await checkWorker(), undefined);
    });
  });

  suite('expireErrors', function() {
    const eid = taskcluster.slugid();
    const makeWPE = async values => {
      const now = new Date();
      await helper.WorkerPoolError.create({
        workerPoolId: 'pp/wt',
        errorId: eid,
        reported: now,
        kind: 'uhoh',
        title: 'Uh.. Oh!',
        description: 'Whoopsie',
        extra: {},
        ...values,
      });
    };

    const checkWPE = async (workerPoolId = 'pp/wt', errorId = eid) => {
      return await helper.WorkerPoolError.load({workerPoolId, errorId}, true);
    };

    setup(function() {
      helper.load.remove('expireErrors');
    });

    test('scan of empty set of errors', async function() {
      await helper.load('expireErrors');
    });

    test('active error', async function() {
      await makeWPE({reported: taskcluster.fromNow('0 seconds')});
      await helper.load('expireErrors');
      assert(await checkWPE());
    });

    test('old error', async function() {
      await makeWPE({reported: taskcluster.fromNow('-10 hours')});
      await helper.load('expireErrors');
      assert.equal(await checkWPE(), undefined);
    });
  });
});
