import assert from 'assert';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';
import { WorkerPoolStats } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  /** @type {import('../src/launch-config-selector.js').LaunchConfigSelector} */
  let launchConfigSelector;

  const maxCapacity = 1000;

  const genAwsLaunchConfig = (workerManager = {}, region = 'us-west-2') => ({
    workerManager,
    region,
    launchConfig: {
      ImageId: 'ami-12345678',
    },
    capacityPerInstance: 1,
  });

  const createWorkerPool = async (launchConfigs = [], workerPoolId = 'wp/id') => {
    const input = {
      providerId: 'aws',
      description: 'bar',
      config: {
        launchConfigs,
        minCapacity: 1,
        maxCapacity,
      },
      owner: 'example@example.com',
      emailOnError: false,
    };
    return await helper.workerManager.createWorkerPool(workerPoolId, input);
  };

  /**
   * @param {import('../src/launch-config-selector.js').WeightedRandomConfig} weightedRandomConfig
   * @param {number} capacity
   */
  const getDistribution = (weightedRandomConfig, capacity = 100) => {
    /** @type {Record<string, number>} */
    const counts = {};

    weightedRandomConfig.selectCapacity(capacity).forEach(cfg => {
      const key = cfg.launchConfigId || 'unknown';
      counts[key] = counts[key] ? counts[key] + 1 : 1;
    });
    return counts;
  };

  const assertDebugMessage = async (wpId = 'wp/id', weights = {}, remainingCapacity = {}) => {
    const monitor = await helper.load('monitor');
    const msgs = monitor.manager.messages.filter(({ Type }) => Type === 'launch-config-selector-debug');
    assert.equal(msgs.length, 1);
    assert.deepEqual(msgs[0].Fields.workerPoolId, wpId);
    assert.deepEqual(msgs[0].Fields.weights, weights);
    assert.deepEqual(msgs[0].Fields.remainingCapacity, remainingCapacity);
    monitor.manager.reset();
  };

  setup(async function() {
    launchConfigSelector = await helper.load('launchConfigSelector');
  });

  test('missing launch configs', async function() {
    const wp = await createWorkerPool();
    const wrc = await launchConfigSelector.forWorkerPool(wp);
    assert.deepEqual(wrc.getAll(), []);
  });

  test('equal weights launch configs', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 1 }),
    ]);

    const wrc = await launchConfigSelector.forWorkerPool(wp);
    assert.equal(wrc.getAll().length, 2);
    assert.equal(wrc.totalWeight, 2);

    assert.ok(wrc.getRandomConfig());
    await assertDebugMessage(wp.workerPoolId, { lc1: 1, lc2: 1 }, { lc1: maxCapacity, lc2: maxCapacity });
  });

  test('zero weights launch configs will not be used', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 0 }),
    ]);

    const wrc = await launchConfigSelector.forWorkerPool(wp);
    assert.equal(wrc.getAll().length, 1);
    assert.equal(wrc.totalWeight, 1);

    assert.equal(wrc.getRandomConfig()?.launchConfig?.launchConfigId, 'lc1');
    await assertDebugMessage(wp.workerPoolId, { lc1: 1, lc2: 0 }, { lc1: maxCapacity, lc2: maxCapacity });
  });

  test('respects weights in random selection', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 0.5 }),
      genAwsLaunchConfig({ launchConfigId: 'lc3', initialWeight: 0.1 }),
    ]);
    const wrc = await launchConfigSelector.forWorkerPool(wp);

    const counts = getDistribution(wrc, 100);
    assert.ok(counts.lc1 > counts.lc2, 'lc1 should be chosen more often than lc2');
    assert.ok(counts.lc2 > counts.lc3, 'lc2 should be chosen more often than lc3');
    assert.ok(counts.unknown === undefined);
    await assertDebugMessage(wp.workerPoolId, { lc1: 1, lc2: 0.5, lc3: 0.1 },
      { lc1: maxCapacity, lc2: maxCapacity, lc3: maxCapacity });
  });

  test('selectCapacity', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1, capacityPerInstance: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 1, capacityPerInstance: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc3', initialWeight: 1, capacityPerInstance: 1 }),
    ]);
    const wrc = await launchConfigSelector.forWorkerPool(wp);

    assert.equal(wrc.selectCapacity(5).length, 5);
    assert.equal(wrc.selectCapacity(15).length, 15);
  });

  test('using workerPoolStats to respect maxCapacity per LC', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1, maxCapacity: 10 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 1, maxCapacity: 10 }),
      genAwsLaunchConfig({ launchConfigId: 'lc3', initialWeight: 1, maxCapacity: 10 }),
    ]);

    const workerPoolStats = new WorkerPoolStats(wp.workerPoolId);
    workerPoolStats.capacityByLaunchConfig.set('lc1', 10); // saturated
    workerPoolStats.capacityByLaunchConfig.set('lc2', 5); // got some room
    workerPoolStats.capacityByLaunchConfig.set('lc3', 10); // saturated

    const wrc = await launchConfigSelector.forWorkerPool(wp, workerPoolStats);
    const counts = getDistribution(wrc, 5);
    assert.equal(counts.lc2, 5);
    await assertDebugMessage(wp.workerPoolId, { lc1: 0, lc2: 0.5, lc3: 0 },
      { lc1: 0, lc2: 5, lc3: 0 });
  });

  test('using workerPoolStats to respect errors by LC', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 1 }),
    ]);

    const workerPoolStats = new WorkerPoolStats(wp.workerPoolId);
    workerPoolStats.totalErrors = 25;
    workerPoolStats.errorsByLaunchConfig.set('lc1', 25); // one that causes all errors

    const wrc = await launchConfigSelector.forWorkerPool(wp, workerPoolStats);
    const counts = getDistribution(wrc, 100);
    assert.equal(counts.lc2, 100);
    await assertDebugMessage(wp.workerPoolId, { lc1: 0, lc2: 1 }, { lc1: maxCapacity, lc2: maxCapacity });
  });

  test('select capacity should respect individual max capacity', async function () {
    const wp = await createWorkerPool([
      genAwsLaunchConfig({ launchConfigId: 'lc1', initialWeight: 1, maxCapacity: 1 }),
      genAwsLaunchConfig({ launchConfigId: 'lc2', initialWeight: 1, maxCapacity: 2 }),
      genAwsLaunchConfig({ launchConfigId: 'lc3', initialWeight: 1 }),
    ]);

    const workerPoolStats = new WorkerPoolStats(wp.workerPoolId);

    const wrc = await launchConfigSelector.forWorkerPool(wp, workerPoolStats);
    const counts = getDistribution(wrc, 100);
    assert.equal(counts.lc1, 1);
    assert.equal(counts.lc2, 2);
    assert.equal(counts.lc3, 97);
    await assertDebugMessage(wp.workerPoolId, { lc1: 1, lc2: 1, lc3: 1 }, { lc1: 1, lc2: 2, lc3: maxCapacity });
  });
});
