const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let estimator;

  setup(async function() {
    estimator = await helper.load('estimator');
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
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
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
      workerInfo,
    });

    assert.strictEqual(estimate, 1);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
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
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
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
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 2);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 3));
    assert(monitorManager.messages.some(({Type, Fields}) => Type === 'monitor.error' && Fields.existingCapacity === 50));
    monitorManager.reset();
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
      workerInfo,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
    monitorManager.reset();
  });
});
