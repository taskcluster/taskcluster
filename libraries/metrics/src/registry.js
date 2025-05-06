import { Counter, Gauge, Histogram, Summary, Registry as PromClientRegistry } from 'prom-client';
import assert from 'assert';

/**
 * @typedef {object} MetricDefinition
 * @property {'counter' | 'gauge' | 'histogram' | 'summary'} type - The type of the metric.
 * @property {string} description - A description of the metric.
 * @property {string[]} labelNames - An array of label names for the metric.
 * @property {number[] | null} [buckets] - An array of numbers representing the buckets for a histogram metric.
 * @property {number[] | null} [percentiles] - An array of numbers between 0 and 1 representing
 *                                             the percentiles for a summary metric.
 */

/**
 * @typedef {object} StoredMetric
 * @property {'counter' | 'gauge' | 'histogram' | 'summary'} type
 * @property {import('prom-client').Metric<string>} metric
 * @property {string[]} labelNames
 */

class Registry {
  /** @type {string} */
  prefix;
  /** @type {Record<string, StoredMetric>} */
  metricMap;
  /** @type {PromClientRegistry} */
  promClientRegistry;

  /**
   * @param {object} options
   * @param {string} options.prefix - Prefix for all metrics in this registry.
   */
  constructor({ prefix }) {
    this.prefix = prefix;
    this.metricMap = {};
    this.promClientRegistry = new PromClientRegistry();
  }

  /**
   * Register a metric in the registry.
   * @param {string} name - The name of the metric (un-prefixed).
   * @param {MetricDefinition} definition - The definition of the metric.
   * @returns {import('prom-client').Metric<string>} The registered prom-client metric instance.
   */
  registerMetric(name, {
    type,
    description,
    labelNames,
    buckets,
    percentiles,
  }) {
    const prefixedName = this.#getPrefixedName(name);

    /** @type {import('prom-client').Metric<string>} */
    let metric;
    const resolvedLabelNames = labelNames || []; // Ensure it's an array
    const metricOptions = {
      name: prefixedName,
      help: description,
      labelNames: resolvedLabelNames, // Pass the resolved array
      registers: [this.promClientRegistry], // Register with our specific registry instance
    };

    switch (type) {
      case 'counter':
        metric = new Counter(metricOptions);
        break;
      case 'gauge':
        metric = new Gauge(metricOptions);
        break;
      case 'histogram':
        if (buckets) {
          // @ts-ignore  // buckets is valid for Histogram
          metricOptions.buckets = buckets;
        }
        metric = new Histogram(metricOptions);
        break;
      case 'summary':
        if (percentiles) {
          // @ts-ignore  // percentiles is valid for Summary
          metricOptions.percentiles = percentiles;
        }
        metric = new Summary(metricOptions);
        break;
      default:
        throw new Error(`Unknown metric type ${type}`);
    }

    this.metricMap[name] = {
      type,
      metric,
      labelNames,
    };

    return metric;
  }

  /**
   * Get a registered metric wrapper.
   * @param {string} name - The name of the metric (un-prefixed).
   * @returns {StoredMetric}
   */
  getMetric(name) {
    const metricInfo = this.metricMap[name];
    assert(metricInfo, `Metric ${name} not found in this registry with prefix ${this.prefix}`);
    return metricInfo;
  }

  /**
   * Get metrics in Prometheus format.
   * @returns {Promise<string>}
   */
  async metrics() {
    return this.promClientRegistry.metrics();
  }

  /**
   * Get metrics in JSON format.
   * @returns {Promise<object[]>}
   */
  async getMetricsAsJSON() {
    return this.promClientRegistry.getMetricsAsJSON();
  }

  /**
   * Get content type for metrics.
   * @returns {string} The content type string (e.g., 'text/plain; version=0.0.4; charset=utf-8').
   */
  contentType() {
    return this.promClientRegistry.contentType;
  }

  /**
   * Prefix a metric name.
   * @param {string} name
   * @returns {string}
   */
  #getPrefixedName(name) {
    return `${this.prefix}_${name}`;
  }

  /**
   * Clears all metrics from this registry instance.
   */
  clear() {
    this.promClientRegistry.clear();
    this.metricMap = {};
  }
}

export { Registry };
