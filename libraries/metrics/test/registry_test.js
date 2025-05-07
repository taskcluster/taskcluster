import assert from 'assert';
import testing from 'taskcluster-lib-testing';
import { Registry } from '../src/registry.js';
import { Registry as PromClientRegistry, Counter, Gauge, Histogram, Summary } from 'prom-client';

suite(testing.suiteName('Registry'), function() {
  let registry;

  setup(function() {
    // Create a new registry instance for each test to ensure isolation
    registry = new Registry({ prefix: 'test_prefix' });
  });

  teardown(function() {
    if (registry) {
      registry.clear(); // Clear any registered metrics and the promClientRegistry
    }
  });

  test('constructor should initialize properties correctly', function() {
    assert.strictEqual(registry.prefix, 'test_prefix', 'Prefix should be set');
    assert.deepStrictEqual(registry.metricMap, {}, 'metricMap should be an empty object');
    assert.ok(registry.promClientRegistry instanceof PromClientRegistry, 'promClientRegistry should be an instance of PromClientRegistry');
  });

  suite('registerMetric', function() {
    test('should register a Counter correctly', function() {
      const def = { type: 'counter', description: 'A test counter', labelNames: ['method'] };
      const promMetric = registry.registerMetric('my_counter', def);

      assert.ok(registry.metricMap.my_counter, 'Counter should be in metricMap');
      assert.strictEqual(registry.metricMap.my_counter.type, 'counter');
      assert.strictEqual(registry.metricMap.my_counter.metric.name, 'test_prefix_my_counter', 'Prometheus metric name should be prefixed');
      assert.deepStrictEqual(registry.metricMap.my_counter.labelNames, ['method']);
      assert.ok(promMetric instanceof Counter, 'Returned metric should be a prom-client Counter');
      assert.strictEqual(promMetric.name, 'test_prefix_my_counter');
    });

    test('should register a Gauge correctly', function() {
      const def = { type: 'gauge', description: 'A test gauge', labelNames: ['status'] };
      registry.registerMetric('my_gauge', def);
      assert.ok(registry.metricMap.my_gauge, 'Gauge should be in metricMap');
      assert.strictEqual(registry.metricMap.my_gauge.type, 'gauge');
      assert.strictEqual(registry.metricMap.my_gauge.metric.name, 'test_prefix_my_gauge');
      assert.ok(registry.metricMap.my_gauge.metric instanceof Gauge, 'Metric should be a prom-client Gauge');
    });

    test('should register a Histogram correctly with buckets', function() {
      const buckets = [0.1, 0.5, 1];
      const def = { type: 'histogram', description: 'A test histogram', labelNames: ['path'], buckets };
      registry.registerMetric('my_histogram', def);
      assert.ok(registry.metricMap.my_histogram, 'Histogram should be in metricMap');
      assert.strictEqual(registry.metricMap.my_histogram.type, 'histogram');
      assert.strictEqual(registry.metricMap.my_histogram.metric.name, 'test_prefix_my_histogram');
      assert.ok(registry.metricMap.my_histogram.metric instanceof Histogram, 'Metric should be a prom-client Histogram');
      // Note: Directly checking buckets on promMetric can be tricky as it might be on prototype or options.
      // Verification via output is more robust if needed.
    });

    test('should register a Summary correctly with percentiles', function() {
      const percentiles = [0.5, 0.9, 0.99];
      const def = { type: 'summary', description: 'A test summary', labelNames: [], percentiles };
      registry.registerMetric('my_summary', def);
      assert.ok(registry.metricMap.my_summary, 'Summary should be in metricMap');
      assert.strictEqual(registry.metricMap.my_summary.type, 'summary');
      assert.strictEqual(registry.metricMap.my_summary.metric.name, 'test_prefix_my_summary');
      assert.ok(registry.metricMap.my_summary.metric instanceof Summary, 'Metric should be a prom-client Summary');
    });

    test('should throw error for unknown metric type', function() {
      const def = { type: 'unknown', description: 'An unknown metric' };
      assert.throws(
        () => registry.registerMetric('my_unknown', def),
        /Unknown metric type unknown/,
      );
    });
  });

  test('getMetric should retrieve a registered metric', function() {
    const def = { type: 'counter', description: 'A counter for getMetric test', labelNames: [] };
    registry.registerMetric('get_me_counter', def);

    const metricInfo = registry.getMetric('get_me_counter');
    assert.ok(metricInfo, 'Metric info should be retrieved');
    assert.strictEqual(metricInfo.type, 'counter');
    assert.strictEqual(metricInfo.metric.name, 'test_prefix_get_me_counter');
  });

  test('getMetric should throw for non-existent metric', function() {
    assert.throws(
      () => registry.getMetric('non_existent_metric'),
      /Metric non_existent_metric not found in this registry with prefix test_prefix/,
    );
  });

  test('metrics() method should return Prometheus formatted string', async function() {
    registry.registerMetric('http_requests', { type: 'counter', description: 'Total HTTP requests', labelNames: ['method', 'path'] });
    const counterInfo = registry.getMetric('http_requests');
    counterInfo.metric.inc({ method: 'GET', path: '/test' }, 5);

    const metricsOutput = await registry.metrics();
    assert.ok(typeof metricsOutput === 'string', 'Output should be a string');
    assert.ok(metricsOutput.includes('# HELP test_prefix_http_requests Total HTTP requests\n'), 'Should include HELP line');
    assert.ok(metricsOutput.includes('# TYPE test_prefix_http_requests counter\n'), 'Should include TYPE line');
    assert.ok(metricsOutput.includes('test_prefix_http_requests{method="GET",path="/test"} 5'), 'Should include metric value');
  });

  test('metrics() should return empty for a cleared registry', async function() {
    registry.registerMetric('temp_metric', { type: 'gauge', description: 'A temp gauge' });
    registry.getMetric('temp_metric').metric.set(10);
    registry.clear();
    const metricsOutput = await registry.metrics();
    // Depending on prom-client, it might be empty or contain some default metrics like process metrics if not disabled.
    // For an empty PromClientRegistry, it should be very minimal.
    // A simple check is that our specific metric is not present.
    assert.ok(!metricsOutput.includes('test_prefix_temp_metric'), 'Cleared metric should not be present');
  });

  test('contentType() should return the correct content type string', function() {
    // This value is hardcoded in prom-client's Registry.js
    assert.strictEqual(registry.contentType(), PromClientRegistry.PROMETHEUS_CONTENT_TYPE);
  });

  test('clear() should empty metricMap and clear promClientRegistry', async function() {
    registry.registerMetric('another_counter', { type: 'counter', description: 'Another counter' });
    registry.getMetric('another_counter').metric.inc();

    registry.clear();

    assert.deepStrictEqual(registry.metricMap, {}, 'metricMap should be empty after clear');
    const metricsOutput = await registry.metrics();
    assert.ok(!metricsOutput.includes('test_prefix_another_counter'), 'Prometheus output should not contain cleared metric');
  });

  // getMetricsAsJSON() is harder to test for exact structure without deep knowledge of prom-client's output
  // A simple test could be to ensure it returns an array and doesn't throw.
  test('getMetricsAsJSON() should return an array', async function() {
    registry.registerMetric('json_metric', { type: 'gauge', description: 'A gauge for JSON test' });
    registry.getMetric('json_metric').metric.set(123);
    const jsonOutput = await registry.getMetricsAsJSON();
    assert.ok(Array.isArray(jsonOutput), 'Output should be an array');
    // Optionally, check if our metric appears (structure might vary)
    const foundMetric = jsonOutput.find(m => m.name === 'test_prefix_json_metric');
    assert.ok(foundMetric, 'Registered metric should be found in JSON output');
    assert.strictEqual(foundMetric.values[0].value, 123, 'Metric value should match in JSON output');
  });
});
