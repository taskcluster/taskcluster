import sinon from 'sinon';
import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';
import helper from './helper.js';
import { CloudAPI } from '../src/providers/cloudapi.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

suite(testing.suiteName(), function() {
  let cloud;

  const initCloudApi = async (options = {}) => {
    const _backoffDelay = 1;
    return new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits: {},
      intervalDefault: 100 * 1000,
      intervalCapDefault: 2000,
      monitor: await helper.load('monitor'),
      ...options,
      providerId: 'fake-provider',
      errorHandler: ({ err, tries }) => {
        if (err.code === 403) { // for testing purposes, 403 = rate limit
          return {
            backoff: _backoffDelay * 50,
            reason: 'rateLimit',
            level: 'notice',
          };
        } else if (err.code === 403 || err.code >= 500) {
          return {
            backoff: _backoffDelay * Math.pow(2, tries),
            reason: 'errors',
            level: 'warning',
          };
        }
        throw err;
      },
    });
  };

  setup(async () => {
    cloud = await initCloudApi();
  });

  test('non existing queue', async function() {
    try {
      await cloud.enqueue('nonexisting', () => {});
    } catch (err) {
      assert.equal(err.message, 'Unknown p-queue attempted: nonexisting');
      return;
    }
    throw new Error('should have thrown an error');
  });

  test('simple', async function() {
    const result = await cloud.enqueue('query', () => 5);
    assert.equal(result, 5);
  });

  test('one 500', async function() {
    const remote = sinon.stub();
    remote.onCall(0).throws({ code: 500 });
    remote.onCall(1).returns(10);
    const result = await cloud.enqueue('query', () => remote());
    assert.equal(result, 10);
    assert.equal(remote.callCount, 2);
  });
  test('multiple 500', async function() {
    const remote = sinon.stub();
    remote.onCall(0).throws({ code: 500 });
    remote.onCall(1).throws({ code: 520 });
    remote.onCall(2).throws({ code: 503 });
    remote.onCall(3).returns(15);
    const result = await cloud.enqueue('query', () => remote());
    assert.equal(result, 15);
    assert.equal(remote.callCount, 4);
  });
  test('500s forever should throw', async function() {
    const remote = sinon.stub();
    remote.throws({ code: 500 });

    try {
      await cloud.enqueue('query', () => remote());
    } catch (err) {
      assert.deepEqual(err, { code: 500 });
      return;
    }
    assert.equal(remote.callCount, 5);
    throw new Error('should have thrown an error');
  });

  test('operations timing out', async function() {
    const cloudWithTimeout = await initCloudApi({ timeout: 1, throwOnTimeout: true });
    const remote = sinon.stub();
    remote.onCall(0).resolves(sleep(5));

    try {
      await cloudWithTimeout.enqueue('query', () => remote());
    } catch (err) {
      assert.equal(err.name, 'TimeoutError');
      return;
    }
    assert.equal(remote.callCount, 1);
  });

  test('metrics not counted if not enabled', async function() {
    cloud = await initCloudApi({ collectMetrics: false });
    await cloud.enqueue('query', () => 5);
    assert.equal(cloud.metrics.total, 0);
  });

  test('metrics should be collected and logged', async function () {
    const monitor = await helper.load('monitor');
    cloud = await initCloudApi({ collectMetrics: true, monitor });

    const remote = sinon.stub();
    remote.onCall(0).throws({ code: 500 });
    remote.onCall(1).returns(1);
    remote.onCall(2).throws({ code: 500 });
    remote.onCall(3).returns(1);
    remote.returns(1);

    await cloud.enqueue('query', () => remote());
    await cloud.enqueue('query', () => remote());
    await cloud.enqueue('query', () => remote());

    assert.equal(cloud.metrics.total, 5);
    assert.equal(cloud.metrics.success, 3);
    assert.equal(cloud.metrics.failed, 2);
    assert.equal(cloud.metrics.retries, 2);
    assert.equal(cloud.metrics.durations.length, 5);
    assert.ok(cloud.metrics.elapsed > 0);
    assert.deepEqual(cloud.metrics.byStatus, {
      500: 2,
      200: 3,
    });

    cloud.logAndResetMetrics();
    assert.equal(cloud.metrics.total, 0);

    const logged = monitor.manager.messages.find(msg => msg.Type === 'cloud-api-metrics');
    assert.ok(logged?.Fields);
    assert.deepEqual(logged.Fields.byStatus, { 500: 2, 200: 3 });
    assert.equal(logged.Fields.total, 5);
    assert.equal(logged.Fields.success, 3);
    assert.ok(logged.Fields.max >= 0);
    assert.ok(logged.Fields.min >= 0);
    assert.ok(logged.Fields.avg >= 0);
    assert.ok(logged.Fields.median >= 0);
    assert.ok(logged.Fields.p95 >= 0);
    assert.ok(logged.Fields.p99 >= 0);
  });
});
