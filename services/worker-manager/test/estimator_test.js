import assert from 'assert';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let estimator, monitor;

  setup(async function() {
    estimator = await helper.load('estimator');
    monitor = await helper.load('monitor');
  });

  test('empty estimation', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 0,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('single estimation', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 1,
      minCapacity: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 1);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('satisfied estimation', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 1,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 1,
      minCapacity: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:1 scale-up', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    helper.queue.setPending('foo/bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 100);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:1 scale-up with lesser max capacity', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    helper.queue.setPending('foo/bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 50,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:2 scale-up', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    helper.queue.setPending('foo/bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 0.5,
      workerInfo,
    });

    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:2 scale-up with existing capacity', async function() {
    const workerInfo = {
      existingCapacity: 25,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    helper.queue.setPending('foo/bar', 100);
    helper.queue.setClaimed('foo/bar', 25);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 0.5,
      workerInfo,
    });
    // 50 more to spawn for 75 total
    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('over-satisfied estimation', async function() {
    const workerInfo = {
      existingCapacity: 50,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 1,
      minCapacity: 1,
      workerInfo,
    });

    // for #3372
    if (monitor.manager.messages.length !== 2) {
      console.log(monitor.manager.messages);
    }

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 2);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 3));
    assert(monitor.manager.messages.some(({ Type, Fields }) => Type === 'monitor.error' && Fields.existingCapacity === 50));
    monitor.manager.reset();
  });

  test('over-satisfied estimation (false positive is not raised)', async function() {
    const workerInfo = {
      existingCapacity: 5,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 1,
      minCapacity: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
    monitor.manager.reset();
  });

  test('empty estimation', async function () {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 0,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });

  test('stopping capacity non zero', async function () {
    const workerInfo = {
      existingCapacity: 10,
      requestedCapacity: 10,
      stoppingCapacity: 10,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 50,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 20);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });
  test('stopping capacity exceeds max capacity', async function () {
    const workerInfo = {
      existingCapacity: 10,
      requestedCapacity: 10,
      stoppingCapacity: 100,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 50,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });
  test('stopping + requested capacity exceeds pending', async function () {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 10,
      stoppingCapacity: 10,
    };
    helper.queue.setPending('foo/bar', 20);
    helper.queue.setClaimed('foo/bar', 0);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      providerId: 'test-provider',
      maxCapacity: 50,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 10);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({ Type, Severity }) => Type === 'simple-estimate' && Severity === 5));
  });
  test('idle capacity', async function () {
    const workerInfo = {
      existingCapacity: 10,
    };

    const tests = [
      { pending: 5, claimed: 0, expected: 0 },
      { pending: 10, claimed: 0, expected: 0 },
      { pending: 11, claimed: 0, expected: 1 }, // pending - existing = 1

      { pending: 5, claimed: 5, expected: 0 }, // pending - claimed = 0
      { pending: 5, claimed: 10, expected: 5 },

      // estimator is currently working with partially stale data
      // as it gets to the actual calculation and calls queue.taskQueueCounts
      // workerInfo values obtained some time ago might be different
      // in this test we would have more claimed than existing
      { pending: 0, claimed: workerInfo.existingCapacity + 1, expected: 0 },
    ];

    for (const { pending, claimed, expected } of tests) {
      helper.queue.setPending('foo/bar', pending);
      helper.queue.setClaimed('foo/bar', claimed);
      const result = await estimator.simple({
        workerPoolId: 'foo/bar',
        providerId: 'test-provider',
        maxCapacity: 50,
        minCapacity: 0,
        scalingRatio: 1,
        workerInfo,
      });
      assert.strictEqual(expected, result);
    }
  });

  suite('desiredCapacity', function() {
    test('returns minCapacity when no pending tasks', async function() {
      helper.queue.setPending('foo/bar', 0);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.desiredCapacity({
        workerPoolId: 'foo/bar',
        minCapacity: 5,
        maxCapacity: 100,
        scalingRatio: 1,
        workerInfo: { existingCapacity: 0, stoppingCapacity: 0, requestedCapacity: 0 },
      });
      assert.strictEqual(result, 5);
    });

    test('respects maxCapacity ceiling', async function() {
      helper.queue.setPending('foo/bar', 200);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.desiredCapacity({
        workerPoolId: 'foo/bar',
        minCapacity: 0,
        maxCapacity: 50,
        scalingRatio: 1,
        workerInfo: { existingCapacity: 0, stoppingCapacity: 0, requestedCapacity: 0 },
      });
      assert.strictEqual(result, 50);
    });

    test('accounts for existing capacity and pending tasks', async function() {
      helper.queue.setPending('foo/bar', 20);
      helper.queue.setClaimed('foo/bar', 5);
      const result = await estimator.desiredCapacity({
        workerPoolId: 'foo/bar',
        minCapacity: 0,
        maxCapacity: 100,
        scalingRatio: 1,
        workerInfo: { existingCapacity: 10, stoppingCapacity: 0, requestedCapacity: 0 },
      });
      // idle = max(0, 10 - 5) = 5
      // adjustedPending = max(0, 20 - 5) = 15
      // desired = max(0, min(15 * 1 + 10, 100)) = 25
      assert.strictEqual(result, 25);
    });

    test('includes stopping capacity in total', async function() {
      helper.queue.setPending('foo/bar', 10);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.desiredCapacity({
        workerPoolId: 'foo/bar',
        minCapacity: 0,
        maxCapacity: 100,
        scalingRatio: 1,
        workerInfo: { existingCapacity: 5, stoppingCapacity: 10, requestedCapacity: 0 },
      });
      // idle = max(0, 5 - 0) = 5
      // adjustedPending = max(0, 10 - 5) = 5
      // totalNonStopped = 5 + 10 = 15
      // desired = max(0, min(5 * 1 + 15, 100)) = 20
      assert.strictEqual(result, 20);
    });

    test('applies scaling ratio', async function() {
      helper.queue.setPending('foo/bar', 100);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.desiredCapacity({
        workerPoolId: 'foo/bar',
        minCapacity: 0,
        maxCapacity: 100,
        scalingRatio: 0.5,
        workerInfo: { existingCapacity: 0, stoppingCapacity: 0, requestedCapacity: 0 },
      });
      // adjustedPending = 100, desired = min(100 * 0.5, 100) = 50
      assert.strictEqual(result, 50);
    });
  });

  suite('targetCapacity', function() {
    test('returns minCapacity when no tasks', async function() {
      helper.queue.setPending('foo/bar', 0);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.targetCapacity({
        workerPoolId: 'foo/bar', minCapacity: 3, maxCapacity: 10,
      });
      assert.strictEqual(result, 3);
    });

    test('counts both pending and claimed tasks as demand', async function() {
      helper.queue.setPending('foo/bar', 2);
      helper.queue.setClaimed('foo/bar', 3);
      const result = await estimator.targetCapacity({
        workerPoolId: 'foo/bar', minCapacity: 0, maxCapacity: 100,
      });
      // (2 + 3) * 1.0 = 5
      assert.strictEqual(result, 5);
    });

    test('respects maxCapacity ceiling', async function() {
      helper.queue.setPending('foo/bar', 50);
      helper.queue.setClaimed('foo/bar', 50);
      const result = await estimator.targetCapacity({
        workerPoolId: 'foo/bar', minCapacity: 0, maxCapacity: 10,
      });
      assert.strictEqual(result, 10);
    });

    test('applies scaling ratio', async function() {
      helper.queue.setPending('foo/bar', 10);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.targetCapacity({
        workerPoolId: 'foo/bar', minCapacity: 0, maxCapacity: 100, scalingRatio: 0.5,
      });
      // 10 * 0.5 = 5
      assert.strictEqual(result, 5);
    });

    test('minCapacity wins over zero demand', async function() {
      helper.queue.setPending('foo/bar', 0);
      helper.queue.setClaimed('foo/bar', 0);
      const result = await estimator.targetCapacity({
        workerPoolId: 'foo/bar', minCapacity: 5, maxCapacity: 100,
      });
      assert.strictEqual(result, 5);
    });
  });
});
