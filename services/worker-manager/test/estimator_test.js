const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

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
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 0,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('single estimation', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 1);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('satisfied estimation', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 1,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:1 scale-up', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    helper.queue.setPending('foo', 'bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 100);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:1 scale-up with lesser max capacity', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    helper.queue.setPending('foo', 'bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 50,
      minCapacity: 0,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:2 scale-up', async function() {
    const workerInfo = {
      existingCapacity: 0,
      requestedCapacity: 0,
    };
    helper.queue.setPending('foo', 'bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 0.5,
      workerInfo,
    });

    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('scaling ratio 1:2 scale-up with existing capacity', async function() {
    const workerInfo = {
      existingCapacity: 25,
      requestedCapacity: 0,
    };
    helper.queue.setPending('foo', 'bar', 100);
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 100,
      minCapacity: 0,
      scalingRatio: 0.5,
      workerInfo,
    });
    // 50 more to spawn for 75 total
    assert.strictEqual(estimate, 50);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('over-satisfied estimation', async function() {
    const workerInfo = {
      existingCapacity: 50,
      requestedCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 2);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 3));
    assert(monitor.manager.messages.some(({Type, Fields}) => Type === 'monitor.error' && Fields.existingCapacity === 50));
    monitor.manager.reset();
  });

  test('over-satisfied estimation (false positive is not raised)', async function() {
    const workerInfo = {
      existingCapacity: 5,
      requestedCapacity: 0,
    };
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      scalingRatio: 1,
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitor.manager.messages.length, 1);
    assert(monitor.manager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
    monitor.manager.reset();
  });
});
