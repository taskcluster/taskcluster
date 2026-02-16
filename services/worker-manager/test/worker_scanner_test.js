import assert from 'assert';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';
import { LEVELS } from '@taskcluster/lib-monitor';
import { Worker, WorkerPool } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withWorkerScanner(mock, skipping);
  helper.resetTables(mock, skipping);

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  // for testing an expiration that will be updated
  const expires = taskcluster.fromNow('6 days');
  // for testing an expiration that won't be updated
  const expires2 = taskcluster.fromNow('8 days');

  const testCase = async ({ workers = [], assertion, expectErrors }) => {
    await Promise.all(workers.map(w => {
      const worker = Worker.fromApi(w);
      return worker.create(helper.db);
    }));
    await helper.initiateWorkerScanner();
    await testing.poll(async () => {
      if (!expectErrors) {
        const error = monitor.manager.messages.find(({ Type }) => Type === 'monitor.error');
        if (error) {
          throw new Error(JSON.stringify(error, null, 2));
        }
      }
      workers.forEach(w => {
        assert.deepEqual(monitor.manager.messages.find(
          msg => msg.Type === 'scan-prepare' && msg.Logger.endsWith(w.providerId)), {
          Logger: `taskcluster.test.provider.${w.providerId}`,
          Type: 'scan-prepare',
          Fields: {},
          Severity: LEVELS.notice,
        });
        assert.deepEqual(monitor.manager.messages.find(
          msg => msg.Type === 'scan-cleanup' && msg.Logger.endsWith(w.providerId)), {
          Logger: `taskcluster.test.provider.${w.providerId}`,
          Type: 'scan-cleanup',
          Fields: {},
          Severity: LEVELS.notice,
        });
      });
      await assertion();
    }, 60, 1000);
    await helper.terminateWorkerScanner();

    if (expectErrors) {
      monitor.manager.reset();
    }
  };

  test('single worker', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: expires2,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
      // verify that expires wasn't updated
      assert.notEqual(worker.providerexpires, expires2);
    },
  }));

  test("multiple workers with same provider", () => testCase({
    workers: [
      {
        workerPoolId: "ff/ee",
        workerGroup: "whatever",
        workerId: "testing-123",
        providerId: "testing1",
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
      {
        workerPoolId: "ff/dd",
        workerGroup: "whatever",
        workerId: "testing-124",
        providerId: "testing1",
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await Worker.get(helper.db, {
        workerPoolId: "ff/ee",
        workerGroup: "whatever",
        workerId: "testing-123",
      });
      assert(worker1.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker1.expires > expires);
      const worker2 = await Worker.get(helper.db, {
        workerPoolId: "ff/dd",
        workerGroup: "whatever",
        workerId: "testing-124",
      });
      assert(worker2.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker2.expires > expires);
    },
  }));

  test('multiple nearly expired workers with different providers', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
      {
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
        providerId: 'testing2',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires,
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    assertion: async () => {
      const worker1 = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker1.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker1.expires > expires);
      const worker2 = await Worker.get(helper.db, {
        workerPoolId: 'ff/dd',
        workerGroup: 'whatever',
        workerId: 'testing-124',
      });
      assert(worker2.providerData.checked);
      // expires should be updated because it is less than 7 days
      assert(worker2.expires > expires);
    },
  }));

  test('worker for previous provider is stopped', () => testCase({
    workers: [
      {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-OLD',
        providerId: 'testing1',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: Worker.states.STOPPED,
        providerData: {},
      }, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
        providerId: 'testing2',
        created: new Date(),
        lastModified: new Date(),
        lastChecked: new Date(),
        expires: taskcluster.fromNow('1 hour'),
        capacity: 1,
        state: Worker.states.REQUESTED,
        providerData: {},
      },
    ],
    workerPools: [
      {
        workerPoolId: 'ff/ee',
        existingCapacity: 1,
        providerId: 'testing2',
        previousProviderIds: ['testing1'],
        description: '',
        created: taskcluster.fromNow('-1 hour'),
        lastModified: taskcluster.fromNow('-1 hour'),
        config: {},
        owner: 'foo@example.com',
        emailOnError: false,
        providerData: {
          // make removeResources fail on the first try, to test error handling
          failRemoveResources: 1,
        },
      },
    ],
    expectErrors: true,
    assertion: async () => {
      const worker = await Worker.get(helper.db, {
        workerPoolId: 'ff/ee',
        workerGroup: 'whatever',
        workerId: 'testing-123',
      });
      assert(worker.providerData.checked);
    },
  }));

  test('default providers filter applied', async () => {
    const azureScanner = await helper.load('workerScannerAzure');
    assert.deepEqual(azureScanner.providersFilter, { cond: '=', value: 'azure' });
    await azureScanner.terminate();

    const scanner = await helper.load('workerScanner');
    assert.deepEqual(scanner.providersFilter, { cond: '<>', value: 'azure' });
    await scanner.terminate();
  });

  suite('termination decisions', function() {
    let scanner, providers, estimator;

    suiteSetup(async function() {
      if (skipping()) {
        return;
      }
      providers = await helper.load('providers');
      estimator = await helper.load('estimator');
    });

    setup(async function() {
      // Create a fresh scanner for each test (no iterate loop, just call scan() directly)
      scanner = new (await import('../src/worker-scanner.js')).WorkerScanner({
        ownName: 'test-scanner',
        providers,
        monitor,
        db: helper.db,
        providersFilter: { cond: '<>', value: '' },
        estimator,
      });
    });

    const createPool = async (poolId, config = {}) => {
      const pool = WorkerPool.fromApi({
        workerPoolId: poolId,
        providerId: 'testing1',
        description: 'test pool',
        owner: 'test@example.com',
        emailOnError: false,
        config: {
          minCapacity: 0,
          maxCapacity: 10,
          scalingRatio: 1.0,
          ...config,
        },
      });
      await pool.create(helper.db);
      return pool;
    };

    const createLaunchConfig = async (launchConfigId, poolId, isArchived = false) => {
      await helper.db.fns.create_worker_pool_launch_config(
        launchConfigId, poolId, isArchived, { config: 'test' }, new Date(), new Date());
    };

    const createWorker = async (opts) => {
      const worker = Worker.fromApi(opts);
      return worker.create(helper.db);
    };

    test('worker with archived launch config is marked for termination', async function() {
      const poolId = 'pp/archived';
      await createPool(poolId, { maxCapacity: 10 });
      await createLaunchConfig('lc-archived', poolId, true);

      await createWorker({
        workerPoolId: poolId,
        workerGroup: 'wg',
        workerId: 'w1',
        providerId: 'testing1',
        created: new Date(),
        expires: taskcluster.fromNow('8 days'),
        capacity: 1,
        state: Worker.states.RUNNING,
        providerData: {},
        launchConfigId: 'lc-archived',
      });

      await scanner.scan();

      const worker = await Worker.get(helper.db, {
        workerPoolId: poolId,
        workerGroup: 'wg',
        workerId: 'w1',
      });
      assert(worker.providerData.shouldTerminate, 'shouldTerminate should be set');
      assert.strictEqual(worker.providerData.shouldTerminate.terminate, true);
      assert.strictEqual(worker.providerData.shouldTerminate.reason, 'launch config archived');
      assert(worker.providerData.shouldTerminate.decidedAt);
    });

    test('all workers needed when at capacity — no termination', async function() {
      const poolId = 'pp/overcap';
      await createPool(poolId, { maxCapacity: 10, minCapacity: 0 });
      await createLaunchConfig('lc-active', poolId, false);

      helper.queue.setPending(poolId, 0);
      helper.queue.setClaimed(poolId, 0);

      const now = new Date();
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-oldest',
        providerId: 'testing1', created: new Date(now.getTime() - 3000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-active',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-middle',
        providerId: 'testing1', created: new Date(now.getTime() - 2000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-active',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-newest',
        providerId: 'testing1', created: new Date(now.getTime() - 1000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-active',
      });

      await scanner.scan();

      // desiredCapacity with 3 existing, 0 pending = max(0, min(0 + 3, 10)) = 3
      const wOldest = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-oldest' });
      const wMiddle = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-middle' });
      const wNewest = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-newest' });
      assert.strictEqual(wOldest.providerData.shouldTerminate.terminate, false);
      assert.strictEqual(wMiddle.providerData.shouldTerminate.terminate, false);
      assert.strictEqual(wNewest.providerData.shouldTerminate.terminate, false);
    });

    test('excess workers with maxCapacity=1 — oldest terminated', async function() {
      const poolId = 'pp/excess';
      await createPool(poolId, { maxCapacity: 1, minCapacity: 0 });
      await createLaunchConfig('lc-active2', poolId, false);

      helper.queue.setPending(poolId, 0);
      helper.queue.setClaimed(poolId, 0);

      const now = new Date();
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-old',
        providerId: 'testing1', created: new Date(now.getTime() - 2000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-active2',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-new',
        providerId: 'testing1', created: new Date(now.getTime() - 1000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-active2',
      });

      await scanner.scan();

      // desiredCapacity with 2 existing, maxCapacity=1: max(0, min(0 + 2, 1)) = 1
      const wOld = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-old' });
      const wNew = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-new' });
      assert.strictEqual(wOld.providerData.shouldTerminate.terminate, true);
      assert.strictEqual(wOld.providerData.shouldTerminate.reason, 'over capacity');
      assert.strictEqual(wNew.providerData.shouldTerminate.terminate, false);
      assert.strictEqual(wNew.providerData.shouldTerminate.reason, 'needed');
    });

    test('workers at minCapacity are not marked even with no pending tasks', async function() {
      const poolId = 'pp/mincap';
      await createPool(poolId, { maxCapacity: 10, minCapacity: 2 });
      await createLaunchConfig('lc-min', poolId, false);

      helper.queue.setPending(poolId, 0);
      helper.queue.setClaimed(poolId, 0);

      const now = new Date();
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w1',
        providerId: 'testing1', created: new Date(now.getTime() - 2000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-min',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w2',
        providerId: 'testing1', created: new Date(now.getTime() - 1000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-min',
      });

      await scanner.scan();

      // minCapacity=2, 2 existing, 0 pending => desired = max(2, min(0 + 2, 10)) = 2
      const w1 = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w1' });
      const w2 = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w2' });
      assert.strictEqual(w1.providerData.shouldTerminate.terminate, false);
      assert.strictEqual(w2.providerData.shouldTerminate.terminate, false);
    });

    test('decision is reversible when demand returns', async function() {
      const poolId = 'pp/reverse';
      await createPool(poolId, { maxCapacity: 10, minCapacity: 0 });
      await createLaunchConfig('lc-rev', poolId, false);

      helper.queue.setPending(poolId, 0);
      helper.queue.setClaimed(poolId, 0);

      const now = new Date();
      // Pre-set shouldTerminate to simulate a previous scan marking w-old for termination
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-old',
        providerId: 'testing1', created: new Date(now.getTime() - 2000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING,
        providerData: {
          shouldTerminate: { terminate: true, reason: 'over capacity', decidedAt: new Date().toISOString() },
        },
        launchConfigId: 'lc-rev',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-new',
        providerId: 'testing1', created: new Date(now.getTime() - 1000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-rev',
      });

      await scanner.scan();

      // With 2 existing workers and 0 pending, desired = max(0, min(0 + 2, 10)) = 2
      const w = await Worker.get(helper.db, { workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-old' });
      assert(w.providerData.shouldTerminate, 'shouldTerminate should be set');
      assert.strictEqual(w.providerData.shouldTerminate.terminate, false);
      assert.strictEqual(w.providerData.shouldTerminate.reason, 'needed');
    });

    test('static provider workers do not get shouldTerminate set', async function() {
      await createWorker({
        workerPoolId: 'pp/static',
        workerGroup: 'wg',
        workerId: 'static-w1',
        providerId: 'static',
        created: new Date(),
        expires: taskcluster.fromNow('8 days'),
        capacity: 1,
        state: Worker.states.RUNNING,
        providerData: {},
      });

      await scanner.scan();

      const worker = await Worker.get(helper.db, {
        workerPoolId: 'pp/static',
        workerGroup: 'wg',
        workerId: 'static-w1',
      });
      assert.strictEqual(worker.providerData.shouldTerminate, undefined);
    });

    test('integration: scanner decision is returned by API endpoint', async function() {
      const poolId = 'pp/integ';
      await createPool(poolId, { maxCapacity: 1, minCapacity: 0 });
      await createLaunchConfig('lc-integ', poolId, false);

      helper.queue.setPending(poolId, 0);
      helper.queue.setClaimed(poolId, 0);

      const now = new Date();
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-old',
        providerId: 'testing1', created: new Date(now.getTime() - 2000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-integ',
      });
      await createWorker({
        workerPoolId: poolId, workerGroup: 'wg', workerId: 'w-new',
        providerId: 'testing1', created: new Date(now.getTime() - 1000),
        expires: taskcluster.fromNow('8 days'), capacity: 1,
        state: Worker.states.RUNNING, providerData: {}, launchConfigId: 'lc-integ',
      });

      // Run the scanner
      await scanner.scan();

      // Verify via API endpoint
      const resultOld = await helper.workerManager.shouldWorkerTerminate(poolId, 'wg', 'w-old');
      assert.strictEqual(resultOld.terminate, true);
      assert.strictEqual(resultOld.reason, 'over capacity');

      const resultNew = await helper.workerManager.shouldWorkerTerminate(poolId, 'wg', 'w-new');
      assert.strictEqual(resultNew.terminate, false);
      assert.strictEqual(resultNew.reason, 'needed');
    });
  });
});
