import assert from 'assert';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';
import { WorkerPool, WorkerPoolError, Worker } from '../src/data.js';
import taskcluster from 'taskcluster-client';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);

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

  suite('expireWorkerPools', function() {
    const checkWP = async workerPoolId => {
      return WorkerPool.fromDbRows(
        await helper.db.fns.get_worker_pool_with_launch_configs(workerPoolId));
    };

    setup(function() {
      helper.load.remove('expireWorkerPools');
    });

    test('scan of empty set of worker pools', async function() {
      await helper.load('expireWorkerPools');
    });

    test('worker pool with an active providerId', async function() {
      await makeWP({ workerPoolId: 'pp/wt', providerId: 'testing' });
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider but previousProviderIds', async function() {
      await makeWP({ workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: ['something'] });
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider and empty previousProviderIds', async function() {
      await makeWP({ workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: [] });
      await helper.load('expireWorkerPools');
      assert.equal(await checkWP('pp/wt'), undefined);
    });
  });

  suite('expireLaunchConfigs', function () {
    const getWPLCs = async (workerPoolId, providerId) => {
      return helper.db.fns.get_worker_pool_launch_configs(workerPoolId, null, null, null);
    };

    const updateWP = async (workerPoolId, providerId, config) => {
      await helper.db.fns.update_worker_pool_with_launch_configs(
        workerPoolId,
        providerId,
        'description',
        config,
        new Date(),
        'test@tc.tc',
        false);
    };

    setup(function() {
      helper.load.remove('expireLaunchConfigs');
    });

    test('nothing to remove', async function() {
      await helper.load('expireLaunchConfigs');
    });

    test('does not remove active launch configs', async function () {
      const workerPoolId = 'pp/wt';
      const providerId = 'testing';

      await makeWP({
        workerPoolId,
        providerId,
        config: {
          launchConfigs: ['lc1', 'lc2', 'lc3'],
        },
      });
      const configs = (await getWPLCs(workerPoolId, providerId)).map(c => c.configuration).sort();
      assert.deepEqual(configs, ['lc1', 'lc2', 'lc3']);

      // updating pool would mark some as archived
      await updateWP(workerPoolId, providerId, {
        launchConfigs: ['lc3', 'lc4'],
      });

      await helper.load('expireLaunchConfigs');
      const configs2 = (await getWPLCs(workerPoolId, providerId)).map(c => c.configuration).sort();
      assert.deepEqual(configs2, ['lc3', 'lc4']);
    });
    test('does not remove archived launch configs with workers', async function () {
      const workerPoolId = 'pp/wt';
      const providerId = 'testing';

      await makeWP({ workerPoolId, providerId, config: {
        launchConfigs: ['lc1', 'lc2', 'lc3'],
      } });

      const lc1 = (await getWPLCs(workerPoolId, providerId)).filter(c => c.configuration === 'lc1').pop();

      await updateWP(workerPoolId, providerId, {
        launchConfigs: ['lc3', 'lc4'],
      });
      await makeWorker({ workerPoolId, providerId, expires: taskcluster.fromNow('1 hour'), launchConfigId: lc1.launch_config_id });

      await helper.load('expireLaunchConfigs');
      const configs2 = (await getWPLCs(workerPoolId, providerId)).map(c => c.configuration).sort();
      assert.deepEqual(configs2, ['lc1', 'lc3', 'lc4']);
    });
  });

  suite('expireWorkers', function() {
    const checkWorker = async (workerPoolId = 'pp/wt', workerGroup = 'wg', workerId = 'wid') => {
      return await Worker.get(helper.db, { workerPoolId, workerGroup, workerId });
    };

    setup(function() {
      helper.load.remove('expireWorkers');
    });

    test('scan of empty set of workers', async function() {
      await helper.load('expireWorkers');
    });

    test('active worker', async function() {
      await makeWorker({ expires: taskcluster.fromNow('1 hour') });
      await helper.load('expireWorkers');
      assert(await checkWorker());
    });

    test('expired worker', async function() {
      await makeWorker({ expires: taskcluster.fromNow('-1 hour') });
      await helper.load('expireWorkers');
      assert.equal(await checkWorker(), undefined);
    });
  });

  suite('expireErrors', function() {
    const eid = taskcluster.slugid();
    const makeWPE = async values => {
      const now = new Date();
      const e = await WorkerPoolError.fromApi({
        errorId: eid,
        workerPoolId: 'pp/wt',
        reported: now,
        kind: 'uhoh',
        title: 'Uh.. Oh!',
        description: 'Whoopsie',
        extra: {},
        ...values,
      });
      await e.create(helper.db);
    };

    const checkWPE = async (workerPoolId = 'pp/wt', errorId = eid) => {
      return await helper.db.fns.get_worker_pool_errors_for_worker_pool2(eid, 'pp/wt', null, null, null);
    };

    const expireWithRetentionDays = async retentionDays => {
      await helper.load('cfg');
      helper.load.cfg('app.workerPoolErrorRetentionDays', retentionDays);
      await helper.load('expireErrors');
    };

    setup(function() {
      helper.load.remove('expireErrors');
    });

    test('expire an empty set of errors', async function() {
      await helper.load('expireErrors');
      assert.equal((await checkWPE()).length, 0);
    });

    test('active error', async function() {
      await makeWPE({ reported: taskcluster.fromNow('10 hours') });
      await expireWithRetentionDays(1);
      assert.equal((await checkWPE()).length, 1);
    });

    test('old error', async function() {
      await makeWPE({ reported: taskcluster.fromNow('-3 days') });
      await expireWithRetentionDays(2);
      assert.equal((await checkWPE()).length, 0);
    });

    test('old error', async function() {
      await makeWPE({ reported: taskcluster.fromNow('-3 days') });
      await expireWithRetentionDays(2);
      assert.equal((await checkWPE()).length, 0);
    });
  });
});
