import assert from 'assert';
import debugFactory from 'debug';
import { Registry } from './registry.js';
import { Metrics } from './metrics.js';

const debug = debugFactory('taskcluster-lib-metrics');

/**
 * @typedef {object} MetricOptions
 * @property {string} name - The name of the metric.
 * @property {'counter' | 'gauge' | 'histogram' | 'summary'} type - The type of the metric.
 * @property {string} description - A description of the metric.
 * @property {string[]} [labelNames] - An array of label names for the metric.
 * @property {number[] | null} [buckets] - An array of numbers representing the buckets for a histogram metric.
 * @property {number[] | null} [percentiles] - An array of numbers between 0 and 1 representing
 *                                             the percentiles for a summary metric.
 * @property {string | null} [serviceName] - The name of the service the metric belongs to.
 */

/**
 * @typedef {object} ServerOptions
 * @property {number} [port=9100] - The port number for the internal metrics server.
 * @property {string} [ip='127.0.0.1'] - The IP address for the internal metrics server.
 */

/**
 * @typedef {object} PushOptions
 * @property {string} gateway - The URL of the Prometheus PushGateway.
 * @property {string} [jobName] - The job name for the PushGateway (defaults to serviceName).
 * @property {Record<string, string>} [groupings] - Additional groupings for the PushGateway.
 * @property {number | null} [interval] - The push interval in ms for long-running processes
 *                                        (default: null, no auto-pushing).
 */

/**
 * @typedef {object} SetupOptions
 * @property {string} serviceName - The required name of the service.
 * @property {string | null} [prefix] - An optional prefix for all metrics (defaults to service name).
 * @property {ServerOptions | null} [server] - Options for the internal metrics server.
 * @property {PushOptions | null} [push] - Options for pushing metrics to a PushGateway.
 * @property {import('taskcluster-lib-monitor').Monitor | null} [monitor]
 */

class MetricsManager {
  /**
   * Register a new metric.
   * @param {MetricOptions} options - The options for the metric.
   */
  static register({
    name,
    type,
    description,
    labelNames = [],
    buckets = null,
    percentiles = null,
    serviceName = null,
  }) {
    assert(name, `Must provide a name for this metric ${name}`);
    assert(/^[a-z][a-zA-Z0-9_]*$/.test(name), `Invalid metric name ${name}`);
    assert(['counter', 'gauge', 'histogram', 'summary'].includes(type),
      `Invalid metric type ${type}. Must be one of: counter, gauge, histogram, summary`);
    assert(description, `Must provide a description for metric ${name}`);

    const key = serviceName ? `${serviceName}:${name}` : name;

    // Check for duplicate registration for the same service
    if (serviceName) {
      if (MetricsManager.metrics[key]) {
        throw new Error(`Cannot register metric ${name} twice for the same service ${serviceName}`);
      }
    } else if (MetricsManager.metrics[key] && !MetricsManager.metrics[key].serviceName) {
      throw new Error(`Cannot register global metric ${name} twice`);
    }

    labelNames.forEach(label => {
      assert(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(label), `Invalid label name ${label} for metric ${name}`);
    });

    if (type === 'histogram' && buckets) {
      assert(Array.isArray(buckets), `Buckets must be an array for histogram ${name}`);
      buckets.forEach(bucket => {
        assert(typeof bucket === 'number', `Bucket values must be numbers for histogram ${name}`);
      });
    }

    if (type === 'summary' && percentiles) {
      assert(Array.isArray(percentiles), `Percentiles must be an array for summary ${name}`);
      percentiles.forEach(percentile => {
        assert(typeof percentile === 'number' && percentile > 0 && percentile < 1,
          `Percentile values must be numbers between 0 and 1 for summary ${name}`);
      });
    }

    debug(`registering metric ${name} ${serviceName ? `for service ${serviceName}` : 'globally'}`);

    MetricsManager.metrics[key] = {
      name,
      type,
      description,
      labelNames,
      buckets,
      percentiles,
      serviceName,
    };
  }

  /**
   * Set up an instance for a service. This returns a Metrics instance
   * which can be used to update metrics.
   *
   * @param {SetupOptions} options - The options for setting up the metrics instance.
   * @returns {Promise<Metrics>} A Promise resolving to a Metrics instance for the service.
   */
  static async setup({
    serviceName,
    prefix = null,
    server = null,
    push = null,
    monitor = null,
  }) {
    assert(serviceName, 'Must provide a serviceName to MetricsManager.setup');

    prefix = prefix || serviceName.replace(/-/g, '_').toLowerCase();

    const registry = new Registry({
      prefix,
    });

    const metricsDefinitions = MetricsManager.metricsForService(serviceName);

    Object.entries(metricsDefinitions).forEach(([metricName, def]) => {
      // Use metricName from the key, which is the actual name to be registered
      // def.name is the original name, which might be different if serviceName was involved in the key
      registry.registerMetric(def.name, def);
    });

    const metricsInstance = new Metrics({
      serviceName,
      registry,
      monitor,
    });

    if (server) {
      metricsInstance.startHttpServer(server);
    }

    if (push) {
      // Await the push setup, which might include an initial push
      await metricsInstance.startPushing(push);
    }

    return metricsInstance;
  }

  /**
   * Return the metrics definitions for the given serviceName.
   * This includes global metrics and metrics specific to the service.
   * @param {string} serviceName - The name of the service.
   * @returns {Record<string, MetricOptions>} An object containing the metric definitions for the service.
   */
  static metricsForService(serviceName) {
    /** @type {Record<string, MetricOptions>} */
    const result = {};

    Object.entries(MetricsManager.metrics).forEach(([key, def]) => {
      if (!def.serviceName || def.serviceName === serviceName) {
        // Use the original metric name (def.name) as the key in the result,
        // as this is what the Registry and Metrics instances will expect.
        result[def.name] = def;
      }
    });

    return result;
  }
}

/** @type {Record<string, MetricOptions>} */
MetricsManager.metrics = {};

export { MetricsManager };
