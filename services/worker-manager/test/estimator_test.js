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
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 0,
      minCapacity: 0,
      existingCapacity: 0,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('single estimation', async function() {
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      existingCapacity: 0,
    });

    assert.strictEqual(estimate, 1);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('satisfied estimation', async function() {
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      existingCapacity: 1,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 1);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 5));
  });

  test('over-satisfied estimation', async function() {
    const estimate = await estimator.simple({
      workerPoolId: 'foo/bar',
      maxCapacity: 1,
      minCapacity: 1,
      existingCapacity: 10,
    });

    assert.strictEqual(estimate, 0);
    assert.strictEqual(monitorManager.messages.length, 2);
    assert(monitorManager.messages.some(({Type, Severity}) => Type === 'simple-estimate' && Severity === 3));
    assert(monitorManager.messages.some(({Type, Fields}) => Type === 'monitor.error' && Fields.existingCapacity === 10));
    monitorManager.reset();
  });
});
