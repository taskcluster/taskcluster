import assert from 'assert';
import _ from 'lodash';
import request from 'superagent';
import nock from 'nock';
import MonitorManager from '../src/monitormanager.js';
import testing from '@taskcluster/lib-testing';

// Register metrics once to be used across all tests
MonitorManager.registerMetric('testingServiceTestCounter', {
  name: 'testing_service_test_counter',
  type: 'counter',
  title: 'A test counter metric',
  description: 'A test counter metric',
  labels: { label1: 'One metric', label2: 'Or another' },
});

MonitorManager.registerMetric('testingServiceHistogram', {
  name: 'testing_service_histogram',
  type: 'histogram',
  title: 'A service-specific histogram metric',
  description: 'A service-specific histogram metric',
  labels: { instance: 'Instance' },
  buckets: [0.05, 0.1, 0.5, 1.0],
  serviceName: 'taskcluster-testing-service',
});

MonitorManager.registerMetric('testingServiceGauge', {
  name: 'testing_service_gauge',
  type: 'gauge',
  title: 'Something to not be exposed by default',
  description: 'Some metric',
  labels: { instance: 'Instance' },
  serviceName: 'taskcluster-testing-service',
  registers: ['extra'],
});

MonitorManager.registerMetric('testingGlobalCounter', {
  name: 'testing_global_counter',
  type: 'counter',
  title: 'A global test counter',
  description: 'A global counter that should propagate to any exposed registry',
  labels: { op: 'Operation name' },
  global: true,
});

const TEST_PORT = 39090;

suite(testing.suiteName(), function() {
  const configDefaults = {
    serviceName: 'testing-service',
    level: 'debug',
    fake: true,
    debug: true,
    prometheusConfig: {
      server: {
        port: TEST_PORT,
      },
      push: {
        gateway: 'http://push-gateway.test:9091',
        jobName: 'push-test-job',
        groupings: {
          instance: 'test-instance',
        },
      },
    },
  };

  suiteTeardown(async function() {
    nock.cleanAll();
  });

  test('starts server and responds to metrics', async function() {
    const monitor = MonitorManager.setup(configDefaults);
    monitor.exposeMetrics();
    monitor.metric.testingServiceTestCounter(1);
    assert.ok(monitor.manager._prometheus.isEnabled);

    const res = await request.get(`http://localhost:${TEST_PORT}/metrics`);
    assert(res.ok, 'Got response');
    assert.match(res.text, /# TYPE testing_service_test_counter counter/);
    assert.match(res.text, /testing_service_test_counter{label1="",label2=""} 1/);
    assert.doesNotMatch(res.text, /separate_registry_metric/);
    await monitor.terminate();
  });

  test('server ignores other urls and methods', async function () {
    const monitor = MonitorManager.setup(configDefaults);
    monitor.exposeMetrics();
    await assert.rejects(
      async () => await request.post(`http://localhost:${TEST_PORT}/metrics`),
      /Not Found/);

    await assert.rejects(
      async () => await request.get(`http://localhost:${TEST_PORT}/other`),
      /Not Found/);

    await monitor.terminate();
  });

  test('global metrics propagate to non-default registries on exposeMetrics', async function() {
    const monitor = MonitorManager.setup({
      ...configDefaults,
      prometheusConfig: { server: { port: TEST_PORT } },
    });
    try {
      // Expose a non-default registry — global metrics should be copied into it
      monitor.exposeMetrics('extra');
      monitor.metric.testingGlobalCounter(1, { op: 'test-op' });

      const res = await request.get(`http://localhost:${TEST_PORT}/metrics`);
      assert(res.ok);
      // Global counter appears in the 'extra' registry
      assert.match(res.text, /testing_global_counter/);
      assert.match(res.text, /op="test-op"/);
      // The non-global default-only counter does NOT appear
      assert.doesNotMatch(res.text, /testing_service_test_counter/);
    } finally {
      await monitor.terminate();
    }
  });

  test('global metrics appear in default registry', async function() {
    const monitor = MonitorManager.setup({
      ...configDefaults,
      prometheusConfig: { server: { port: TEST_PORT } },
    });
    try {
      monitor.exposeMetrics(); // default registry
      monitor.metric.testingGlobalCounter(1, { op: 'default-op' });

      const res = await request.get(`http://localhost:${TEST_PORT}/metrics`);
      assert(res.ok);
      assert.match(res.text, /testing_global_counter/);
    } finally {
      await monitor.terminate();
    }
  });

  test('push gateway successfully sends metrics', async function() {
    const pushGateway = nock('http://push-gateway.test:9091')
      .put('/metrics/job/push-test-job/instance/test-instance', (body) => {
        return body.includes('http_requests_total') &&
               body.includes('label1="push-value"') &&
               body.includes('label2="test"');
      })
      .reply(200, 'OK');

    const monitor = MonitorManager.setup(configDefaults);
    monitor.exposeMetrics();
    monitor.metric.testingServiceTestCounter(5, { label1: 'push-value', label2: 'test' });

    await monitor.pushMetrics();
    assert.ok(pushGateway.isDone(), 'Push gateway received the metrics with correct data');
    await monitor.terminate();
  });

});
