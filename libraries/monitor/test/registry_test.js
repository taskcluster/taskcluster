import assert from 'assert';
import _ from 'lodash';
import MonitorManager from '../src/monitormanager.js';
import testing from 'taskcluster-lib-testing';

MonitorManager.registerMetric({
  name: 'test_counter',
  type: 'counter',
  description: 'A test counter metric',
  labelNames: ['label1', 'label2'],
});

MonitorManager.registerMetric({
  name: 'service_histogram',
  type: 'histogram',
  description: 'A service-specific histogram metric',
  labelNames: ['instance'],
  buckets: [0.05, 0.1, 0.5, 1.0],
  serviceName: 'taskcluster-testing-service',
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
    const globalMetric = _.find(ref.metrics, { name: 'test_counter' });
    assert.equal(globalMetric.type, 'counter');
    assert.equal(globalMetric.description, 'A test counter metric');
    assert.deepEqual(globalMetric.labelNames, ['label1', 'label2']);

    // Test service-specific metrics are included
    const serviceMetric = _.find(ref.metrics, { name: 'service_histogram' });
    assert.equal(serviceMetric.type, 'histogram');
    assert.equal(serviceMetric.description, 'A service-specific histogram metric');
    assert.deepEqual(serviceMetric.buckets, [0.05, 0.1, 0.5, 1.0]);
  });

  test('throws on duplicate metric registration', function() {
    assert.throws(() => {
      MonitorManager.registerMetric({
        name: 'test_counter',
        type: 'counter',
        description: 'Duplicate metric',
      });
    }, /Cannot register global metric test_counter twice/);

    assert.throws(() => {
      MonitorManager.registerMetric({
        name: 'service_histogram',
        type: 'histogram',
        description: 'Duplicate metric',
        serviceName: 'taskcluster-testing-service',
      });
    }, /Cannot register metric service_histogram twice for the same service/);
  });

  test('validates metric type and labels', function() {
    assert.throws(() => {
      MonitorManager.registerMetric({
        name: 'invalid_type_metric',
        type: 'invalid',
        description: 'This metric has an invalid type',
      });
    }, /Invalid metric type invalid/);
    assert.throws(() => {
      MonitorManager.registerMetric({
        name: 'invalid_labels',
        type: 'counter',
        description: 'This metric has invalid label names',
        labelNames: ['valid', '0invalid'],
      });
    }, /Invalid label name 0invalid/);
  });
});
