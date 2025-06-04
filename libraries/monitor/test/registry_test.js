import assert from 'assert';
import _ from 'lodash';
import MonitorManager from '../src/monitormanager.js';
import testing from 'taskcluster-lib-testing';

MonitorManager.registerMetric('testCounter', {
  name: 'test_counter_xx',
  type: 'counter',
  title: 'A test counter metric',
  description: 'A test counter metric',
  labels: { label1: 'One metric', label2: 'Or another' },
});

MonitorManager.registerMetric('serviceHistogram', {
  name: 'service_histogram_xx',
  type: 'histogram',
  title: 'A service-specific histogram metric',
  description: 'A service-specific histogram metric',
  labels: { instance: 'Instance' },
  buckets: [0.05, 0.1, 0.5, 1.0],
  serviceName: 'taskcluster-testing-service',
});

MonitorManager.registerMetric('separateCounter', {
  name: 'separate_counter',
  type: 'counter',
  title: 'A test counter metric belonging to a different registry',
  description: 'A test counter metric belonging to a different registry',
  labels: { label1: 'One metric', label2: 'Or another' },
  registers: ['special'],
});
MonitorManager.registerMetric('sharedCounter', {
  name: 'shared_counter',
  type: 'counter',
  title: 'Metric in multiple registries',
  description: 'Metric in multiple registries',
  labels: { label1: 'One metric', label2: 'Or another' },
  registers: ['special', 'default'],
});

MonitorManager.register({
  name: 'auditLog',
  title: 'whatever',
  type: 'audit',
  level: 'info',
  version: 1,
  description: 'An example of a custom message type',
  fields: {
    foo: 'A foo field. This will be an object with ...',
    bar: 'A bar field. This will be a string',
  },
});

suite(testing.suiteName(), function() {
  test('can add custom message types', function() {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
    });
    monitor.log.auditLog({ foo: {}, bar: 'hi' });
    assert.equal(monitor.manager.messages.length, 1);
  });

  test('can verify custom types', function() {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
      verify: true,
    });
    monitor.log.auditLog({ foo: {}, bar: 'hi' });
    assert.throws(() => monitor.log.auditLog({ foo: null }), /"auditLog" must include field "bar"/);
  });

  test('can publish types', function() {
    const serviceName = 'taskcluster-testing-service';
    assert.equal(MonitorManager.reference(serviceName).serviceName, serviceName);
    const ref = _.find(MonitorManager.reference(serviceName).types, { name: 'auditLog' });
    assert.deepEqual(ref.type, 'audit');
    assert.deepEqual(ref.name, 'auditLog');
    assert.deepEqual(ref.title, 'whatever');
    assert.deepEqual(ref.level, 'info');
    assert.deepEqual(ref.version, 1);
  });

  test('can publish metrics in metrics reference', function() {
    const serviceName = 'taskcluster-testing-service';
    const ref = MonitorManager.metricsReference(serviceName);

    // Test global metrics are included
    const globalMetric = _.find(ref.metrics, { name: 'test_counter_xx' });
    assert.equal(globalMetric.type, 'counter');
    assert.equal(globalMetric.description, 'A test counter metric');
    assert.deepEqual(Object.keys(globalMetric.labels), ['label1', 'label2']);

    // Test service-specific metrics are included
    const serviceMetric = _.find(ref.metrics, { name: 'service_histogram_xx' });
    assert.equal(serviceMetric.type, 'histogram');
    assert.equal(serviceMetric.description, 'A service-specific histogram metric');
    assert.deepEqual(serviceMetric.buckets, [0.05, 0.1, 0.5, 1.0]);
  });

  test('throws on duplicate metric registration', function() {
    assert.throws(() => {
      MonitorManager.registerMetric('aa1', {
        name: 'test_counter_xx',
        type: 'counter',
        title: 'Duplicate metric',
        description: 'Duplicate metric',
      });
    }, /Cannot register metric test_counter_xx twice/);

    assert.throws(() => {
      MonitorManager.registerMetric('aa2', {
        name: 'service_histogram_xx',
        type: 'histogram',
        title: 'Duplicate metric',
        description: 'Duplicate metric',
        serviceName: 'taskcluster-testing-service',
      });
    }, /Cannot register metric service_histogram_xx twice/);
  });

  test('validates metric type and labels', function() {
    assert.throws(() => {
      MonitorManager.registerMetric('aa3', {
        name: 'invalid_type_metric',
        type: 'invalid',
        title: 'This metric has an invalid type',
        description: 'This metric has an invalid type',
      });
    }, /Invalid metric type invalid/);
    assert.throws(() => {
      MonitorManager.registerMetric('aa4', {
        name: 'invalid_labels',
        type: 'counter',
        title: 'This metric has invalid label names',
        description: 'This metric has invalid label names',
        labels: { valid: 'yes', '0invalid': 'no' },
      });
    }, /Invalid label name 0invalid/);
  });
  test('validates registers', function() {
    assert.throws(() => {
      MonitorManager.registerMetric('aa5', {
        name: 'empty_registers',
        type: 'counter',
        title: 'This metric has an invalid registers',
        description: 'This metric has an invalid registers',
        registers: [],
      });
    }, /Must provide at least one register/);
  });

  test('can use metrics', async function() {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
      prometheusConfig: {},
    });
    monitor.metric.testCounter();
    monitor.metric.testCounter(10);
    monitor.metric.serviceHistogram(33);
    monitor.metric.separateCounter();
    monitor.metric.sharedCounter();

    const metrics = await monitor.manager._prometheus.metricsJson();
    const counter = metrics.find(({ name }) => name.endsWith('test_counter_xx'));
    assert.equal(counter.values[0].value, 11);

    const histogram = metrics.find(({ name }) => name.endsWith('service_histogram_xx'));
    // histograms store values in buckets
    assert.equal(histogram.values.filter(({ value }) => value === 33).length, 1);

    assert.ok(metrics.find(({ name }) => name.endsWith('shared_counter')),
      'expected shared metric in default registry');

    // special counter should not be in the default registry
    assert.equal(metrics.find(({ name }) => name.endsWith('separate_counter')), undefined);

    const specialMetrics = await monitor.manager._prometheus.metricsJson('special');
    const specialCounter = specialMetrics.find(({ name }) => name.endsWith('separate_counter'));
    assert.equal(specialCounter.values[0].value, 1);

    assert.ok(specialMetrics.find(({ name }) => name.endsWith('shared_counter')),
      'expected shared metric in special registry');
  });

  test('throws error when invalid metric names are used', async function () {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
      prometheusConfig: {},
    });
    assert.throws(() => {
      monitor.metric.unknownMetric();
    }, /Metric "unknownMetric" is not registered/);
  });
});
