import assert from 'assert';
import testing from 'taskcluster-lib-testing';
import { MetricsManager } from '../src/index.js';

suite(testing.suiteName(), function() {
  // Clear metrics before each test
  setup(function() {
    // Clears the static metric definitions store in MetricsManager
    Object.keys(MetricsManager.metrics).forEach(key => {
      delete MetricsManager.metrics[key];
    });
  });

  suite('MetricsManager', function() {
    test('should register a metric', function() {
      MetricsManager.register({
        name: 'test_counter',
        type: 'counter',
        description: 'A test counter',
        labelNames: ['label1', 'label2'],
      });

      // Accessing MetricsManager.metrics directly for verification of registration
      const registeredMetric = Object.values(MetricsManager.metrics).find(m => m.name === 'test_counter');
      assert(registeredMetric, 'metric should exist in MetricsManager.metrics store');
      assert.equal(registeredMetric.type, 'counter');
      assert.equal(registeredMetric.description, 'A test counter');
      assert.deepEqual(registeredMetric.labelNames, ['label1', 'label2']);
    });

    test('should register service-specific metrics', function() {
      MetricsManager.register({
        name: 'service_metric',
        type: 'gauge',
        description: 'A service-specific metric',
        serviceName: 'test-service',
      });

      const metricsForService = MetricsManager.metricsForService('test-service');
      assert(metricsForService.service_metric, 'service-specific metric should exist for its service');
      assert.equal(metricsForService.service_metric.name, 'service_metric');

      const metricsForOtherService = MetricsManager.metricsForService('other-service');
      assert(!metricsForOtherService.service_metric,
        'metric should not be available to other services via metricsForService if not global');
    });

    test('should prevent duplicate metric registration for the same service', function() {
      MetricsManager.register({
        name: 'dup_metric',
        type: 'counter',
        description: 'A metric',
        serviceName: 'test-service',
      });

      assert.throws(() => {
        MetricsManager.register({
          name: 'dup_metric',
          type: 'gauge',
          description: 'Another metric',
          serviceName: 'test-service',
        });
      }, /Cannot register metric dup_metric twice for the same service test-service/);
    });

    test('should allow the same metric name for different services', function() {
      MetricsManager.register({
        name: 'shared_name',
        type: 'counter',
        description: 'A metric for service1',
        serviceName: 'service1',
      });

      assert.doesNotThrow(() => {
        MetricsManager.register({
          name: 'shared_name',
          type: 'gauge',
          description: 'A metric for service2',
          serviceName: 'service2',
        });
      }, 'Registering same metric name with different serviceName should not throw');

      const service1Metrics = MetricsManager.metricsForService('service1');
      const service2Metrics = MetricsManager.metricsForService('service2');

      assert(service1Metrics.shared_name, 'Metric shared_name should exist for service1');
      assert.equal(service1Metrics.shared_name.type, 'counter');
      assert(service2Metrics.shared_name, 'Metric shared_name should exist for service2');
      assert.equal(service2Metrics.shared_name.type, 'gauge');
    });
  });

  suite('Metrics setup', function() {
    setup(function() {
      // Register some global metrics for these tests
      MetricsManager.register({
        name: 'test_counter_global',
        type: 'counter',
        description: 'A global test counter',
      });

      MetricsManager.register({
        name: 'test_gauge_global',
        type: 'gauge',
        description: 'A global test gauge',
      });
    });

    test('should create a metrics instance with registered metrics', async function() {
      const metrics = await MetricsManager.setup({ serviceName: 'test-service' });

      assert.ok(metrics, 'Metrics instance should be created');
      assert.equal(typeof metrics.increment, 'function', 'increment method should be available');
      assert.equal(typeof metrics.set, 'function', 'set method should be available');
      assert.equal(typeof metrics.observe, 'function', 'observe method should be available');
      assert.equal(typeof metrics.startTimer, 'function', 'startTimer method should be available');
      assert.equal(metrics.serviceName, 'test-service', 'serviceName should be set on metrics instance');
      assert.ok(metrics.registry, 'Registry should exist on metrics instance');
    });

    test('should allow incrementing counters', async function() {
      const metrics = await MetricsManager.setup({ serviceName: 'test-service' });

      assert.doesNotThrow(() => {
        metrics.increment('test_counter_global');
      }, 'Incrementing a counter should not throw');

      assert.throws(() => {
        metrics.increment('test_gauge_global');
      }, /Cannot increment metric test_gauge_global of type gauge/, 'Incrementing a gauge should throw');
    });

    test('should allow setting gauge values', async function() {
      const metrics = await MetricsManager.setup({ serviceName: 'test-service' });

      assert.doesNotThrow(() => {
        metrics.set('test_gauge_global', 10);
      }, 'Setting a gauge value should not throw');

      assert.throws(() => {
        metrics.set('test_counter_global', 10);
      }, /Cannot set metric test_counter_global of type counter/, 'Setting a counter value should throw');
    });

    test('metrics instance registry should be isolated and contain prefixed metrics', async function() {
      const serviceName = 'isolated_service';
      const prefix = 'myprefix';
      MetricsManager.register({
        name: 'specific_metric_for_isolation_test',
        type: 'counter',
        description: 'Specific for isolation test',
        serviceName: serviceName, // Make it specific to this service
      });
      MetricsManager.register({
        name: 'global_metric_for_isolation_test',
        type: 'gauge',
        description: 'Global for isolation test',
        // No serviceName, so it's global
      });

      const metrics = await MetricsManager.setup({ serviceName: serviceName, prefix: prefix });
      assert.ok(metrics.registry, 'Registry should be present');

      // Check that the registry has the metrics, and they are prefixed
      // These will be async calls now
      const promText = await metrics.registry.metrics();

      const expectedPrefixedSpecificName = `${prefix}_specific_metric_for_isolation_test`;
      const expectedPrefixedGlobalName = `${prefix}_global_metric_for_isolation_test`;

      assert(promText.includes(expectedPrefixedSpecificName), `Prometheus output should contain ${expectedPrefixedSpecificName}`);
      assert(promText.includes(expectedPrefixedGlobalName), `Prometheus output should contain ${expectedPrefixedGlobalName}`);

      // Test getMetric from our Registry wrapper
      const specificMetricInfo = metrics.registry.getMetric('specific_metric_for_isolation_test');
      assert.equal(specificMetricInfo.metric.name, expectedPrefixedSpecificName, 'Metric name from getMetric should be prefixed');

      const globalMetricInfo = metrics.registry.getMetric('global_metric_for_isolation_test');
      assert.equal(globalMetricInfo.metric.name, expectedPrefixedGlobalName, 'Global metric name from getMetric should be prefixed');
    });
  });
});
