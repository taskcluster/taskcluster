import { MetricsManager } from '../src/index.js';

/**
 * This example demonstrates the correct usage of the metrics library,
 * including async setup and async registry methods.
 */

// IIFE to allow top-level await
(async () => {
  // Register metrics
  MetricsManager.register({
    name: 'example_counter',
    type: 'counter',
    description: 'An example counter metric',
    labelNames: ['label1', 'label2'],
    serviceName: 'example-service', // All metrics in an example should typically belong to a service
  });

  MetricsManager.register({
    name: 'example_gauge',
    type: 'gauge',
    description: 'An example gauge metric',
    labelNames: ['label1'],
    serviceName: 'example-service',
  });

  MetricsManager.register({
    name: 'example_histogram',
    type: 'histogram',
    description: 'An example histogram metric',
    labelNames: ['label1'],
    buckets: [0.1, 0.5, 1, 5, 10],
    serviceName: 'example-service',
  });

  let metrics;
  try {
    // Setup metrics - MetricsManager.setup() is now async
    metrics = await MetricsManager.setup({
      serviceName: 'example-service',
      prefix: 'demo', // Add a prefix for clarity
    });
  } catch (error) {
    console.error('Failed to set up metrics:', error);
    process.exit(1);
  }

  console.log('Metrics setup complete. Running usage examples...');

  // Usage examples

  // Increment a counter - Parameter order: name, value (optional, defaults to 1), labels (optional)
  metrics.increment('example_counter', 5, { label1: 'val1.1', label2: 'val1.2' });
  metrics.increment('example_counter', 1, { label1: 'val2.1', label2: 'val2.2' });
  console.log('Counter incremented.');

  // Set a gauge - Parameter order: name, value, labels (optional)
  metrics.set('example_gauge', 42, { label1: 'gauge_val1' });
  console.log('Gauge set.');
  metrics.set('example_gauge', 23, { label1: 'gauge_val2' }); // Set with different label

  // Observe a histogram value - Parameter order: name, value, labels (optional)
  metrics.observe('example_histogram', 2.5, { label1: 'hist_val1' });
  metrics.observe('example_histogram', 0.2, { label1: 'hist_val1' });
  metrics.observe('example_histogram', 7.0, { label1: 'hist_val2' });
  console.log('Histogram observed.');

  // Use a timer - startTimer takes name and labels (optional)
  const endTimer = metrics.startTimer('example_histogram', { label1: 'timer_label' });
  console.log('Timer started for example_histogram with label1=timer_label...');

  // Simulate an operation that takes time
  await new Promise(resolve => setTimeout(resolve, 150));

  const duration = endTimer(); // End the timer, optionally pass final labels here
  console.log(`Timer ended. Duration recorded: ${duration.toFixed(4)}s`);

  // Reset a metric (e.g., a counter)
  // Note: reset() typically clears all label combinations for that metric.
  metrics.reset('example_counter');
  console.log('example_counter has been reset.');
  metrics.increment('example_counter', 1, { label1: 'after_reset', label2: 'check' });

  console.log('\n--- Current Metrics Output (Prometheus format) ---\n');
  try {
    // metrics.registry.metrics() is now async
    const promOutput = await metrics.registry.metrics();
    console.log(promOutput);
  } catch (error) {
    console.error('Failed to get metrics from registry:', error);
  }

  console.log('\n--- Example Finished ---\n');
  // No explicit process.exit(), let the script end naturally.

})().catch(topLevelError => {
  console.error('Unhandled error in usage-pattern example:', topLevelError);
  process.exit(1);
});
