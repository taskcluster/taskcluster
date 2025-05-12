import assert from 'assert';
import http from 'http';
import { Counter, Gauge, Histogram, Summary, Registry as PromClientRegistry, Pushgateway } from 'prom-client';

/**
 * @typedef {object} ServerOptions
 * @property {number} [port=9100] - Port to listen on.
 * @property {string} [ip='127.0.0.1'] - IP address to bind to.
 */

/**
 * @typedef {object} PushOptions
 * @property {string} gateway - URL of the Prometheus PushGateway.
 * @property {string} [jobName] - Job name for the PushGateway (defaults to serviceName).
 * @property {Record<string, string>} [groupings={}] - Additional groupings for the PushGateway. Key/value pairs.
 */

/**
 * @typedef {object} PrometheusOptions
 * @property {string} serviceName - Name of the service.
 * @property {string} [prefix] - Prefix for all metrics (defaults to sanitized service name).
 * @property {ServerOptions} [server] - Options for metrics server.
 * @property {PushOptions} [push] - Options for pushing to a Prometheus PushGateway.
 */

/**
 * @typedef {object} MetricDefinition
 * @property {string} name - Name of the metric.
 * @property {'counter' | 'gauge' | 'histogram' | 'summary'} type - Type of metric.
 * @property {string} description - Description of the metric.
 * @property {string[]} [labelNames] - Array of label names.
 * @property {number[]} [buckets] - Buckets for histograms.
 * @property {number[]} [percentiles] - Percentiles for summaries.
 * @property {string} [serviceName] - Service this metric belongs to.
 */

/**
 * @typedef {object} MetricInfo
 * @property {'counter' | 'gauge' | 'histogram' | 'summary'} type - Type of the metric
 * @property {string[]} labelNames - Array of label names for the metric
 * @property {import('prom-client').Metric<string>} metric - The actual metric instance
 */

class PrometheusPlugin {
  /**
   * @param {object} options
   * @param {string} options.serviceName
   * @param {string} options.prefix
   * @param {ServerOptions} options.server
   * @param {PushOptions} options.push
   */
  constructor({ serviceName, prefix, server, push }) {
    this.serviceName = serviceName;
    this.prefix = (prefix || serviceName).replace(/-/g, '_').toLowerCase();
    this.serverOptions = server;
    this.pushOptions = push;
    this.server = null;
    this.pushGateway = null;
    this.registry = new PromClientRegistry();
    /** @type {Record<string, MetricInfo>} */
    this.metricsStore = {};
    this.monitor = null;
  }

  /**
   * Initialize the Prometheus plugin with a monitor instance.
   * @param {import('../monitor.js').default} monitor - The monitor instance.
   */
  init(monitor) {
    this.monitor = monitor;

    // Start server if configured
    if (this.serverOptions) {
      this.startHttpServer(this.serverOptions);
    }

    // Start push if configured
    if (this.pushOptions) {
      this.startPushing(this.pushOptions).catch(err => {
        this.monitor?.reportError(`Failed to start metrics pushing: ${err.message}`);
      });
    }
  }

  /**
   * Register a metric with the Prometheus registry.
   * @param {string} name - The name of the metric.
   * @param {MetricDefinition} definition - The metric definition.
   * @returns {import('prom-client').Metric<string>} The registered metric.
   */
  registerMetric(name, {
    type,
    description,
    labelNames = [],
    buckets,
    percentiles,
  }) {
    const prefixedName = `${this.prefix}_${name}`;

    /** @type {import('prom-client').Metric<string>} */
    let metric;
    const metricOptions = {
      name: prefixedName,
      help: description,
      labelNames: labelNames,
      registers: [this.registry],
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
          // @ts-ignore
          metricOptions.buckets = buckets;
        }
        metric = new Histogram(metricOptions);
        break;
      case 'summary':
        if (percentiles) {
          // @ts-ignore
          metricOptions.percentiles = percentiles;
        }
        metric = new Summary(metricOptions);
        break;
      default:
        throw new Error(`Unknown metric type ${type}`);
    }

    this.metricsStore[name] = {
      type,
      metric,
      labelNames,
    };

    return metric;
  }

  /**
   * Get a registered metric.
   * @param {string} name - The name of the metric.
   */
  getMetric(name) {
    const metricInfo = this.metricsStore[name];
    assert(metricInfo, `Metric ${name} not found in Prometheus registry`);
    return metricInfo;
  }

  /**
   * Increment a counter or gauge metric.
   * @param {string} name - The name of the metric.
   * @param {number} [value=1] - The value to increment by.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  increment(name, value = 1, labels = {}) {
    const metricInfo = this.getMetric(name);
    assert(metricInfo.type === 'counter' || metricInfo.type === 'gauge',
      `Cannot increment metric ${name} of type ${metricInfo.type}`);

    const normalizedLabels = this._normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.inc(normalizedLabels, value);
    } else {
      metricInfo.metric.inc(value);
    }
  }

  /**
   * Decrement a gauge metric.
   * @param {string} name - The name of the metric.
   * @param {number} [value=1] - The value to decrement by.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  decrement(name, value = 1, labels = {}) {
    const metricInfo = this.getMetric(name);
    assert(metricInfo.type === 'gauge', `Cannot decrement metric ${name} of type ${metricInfo.type}`);

    const normalizedLabels = this._normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.dec(normalizedLabels, value);
    } else {
      metricInfo.metric.dec(value);
    }
  }

  /**
   * Set the value of a gauge metric.
   * @param {string} name - The name of the metric.
   * @param {number} value - The value to set.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  set(name, value, labels = {}) {
    const metricInfo = this.getMetric(name);
    assert(metricInfo.type === 'gauge', `Cannot set metric ${name} of type ${metricInfo.type}`);

    const normalizedLabels = this._normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.set(normalizedLabels, value);
    } else {
      metricInfo.metric.set(value);
    }
  }

  /**
   * Observe a value for a histogram or summary metric.
   * @param {string} name - The name of the metric.
   * @param {number} value - The value to observe.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  observe(name, value, labels = {}) {
    const metricInfo = this.getMetric(name);
    assert(
      metricInfo.type === 'histogram' || metricInfo.type === 'summary',
      `Cannot observe metric ${name} of type ${metricInfo.type}`,
    );

    const normalizedLabels = this._normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.observe(normalizedLabels, value);
    } else {
      metricInfo.metric.observe(value);
    }
  }

  /**
   * Start a timer for a histogram or summary metric.
   * @param {string} name - The name of the metric.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   * @returns {(finalLabels?: Record<string, string | number | boolean>) => number} Timer end function.
   */
  startTimer(name, labels = {}) {
    const metricInfo = this.getMetric(name);
    assert(
      metricInfo.type === 'histogram' || metricInfo.type === 'summary',
      `Cannot time metric ${name} of type ${metricInfo.type}`,
    );

    const normalizedLabels = this._normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      const end = metricInfo.metric.startTimer(normalizedLabels);
      return (finalLabels) => {
        const finalCombinedLabels = finalLabels ? {
          ...normalizedLabels,
          ...this._normalizeLabels(finalLabels, metricInfo.labelNames),
        } : normalizedLabels;
        return end(finalCombinedLabels);
      };
    }

    const end = metricInfo.metric.startTimer();
    return () => end();
  }

  /**
   * Reset a metric to its initial state.
   * @param {string} name - The name of the metric.
   */
  reset(name) {
    const metricInfo = this.getMetric(name);
    metricInfo.metric.reset();
  }

  /**
   * Get metrics in Prometheus format.
   * @returns {Promise<string>} Prometheus-formatted metrics.
   */
  async metrics() {
    return this.registry.metrics();
  }

  /**
  * For testing purposes
  */
  async metricsJson() {
    return this.registry.getMetricsAsJSON();
  }

  /**
   * Get the content type for Prometheus metrics.
   * @returns {string} Content type string.
   */
  contentType() {
    return this.registry.contentType;
  }

  /**
   * Create an HTTP request handler for serving metrics.
   * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>}
   */
  createMetricsHandler() {
    return async (req, res) => {
      if (req.url === '/metrics' && req.method === 'GET') {
        try {
          const data = await this.metrics();
          res.statusCode = 200;
          res.setHeader('Content-Type', this.contentType());
          res.end(data);
        } catch (err) {
          this.monitor?.reportError(err);
          res.statusCode = 500;
          res.end(`Error generating metrics: ${err.message}`);
        }
      } else if (req.url === '/health' || req.url === '/healthz') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('OK');
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    };
  }

  /**
   * Start an HTTP server for metrics.
   * @param {ServerOptions} [options={}] - Server options.
   * @returns {http.Server} HTTP server.
   */
  startHttpServer(options = {}) {
    const { port = 9100, ip = '127.0.0.1' } = options;

    if (this.server) {
      this.monitor?.err('Metrics server is already running. Returning existing server.');
      return this.server;
    }

    const handler = this.createMetricsHandler();
    this.server = http.createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        this.monitor?.reportError(err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(`Internal Server Error: ${err.message}`);
        }
      }
    });

    this.server.listen(port, ip, () => {
      this.monitor?.info(`Metrics server listening on ${ip}:${port}`);
    });

    return this.server;
  }

  /**
   * Set up push mode to Prometheus PushGateway.
   * @param {PushOptions} options - Push options.
   * @returns {Promise<void>} Promise that resolves when push setup is complete.
   */
  async startPushing(options) {
    const { gateway, jobName = this.serviceName, groupings = {} } = options;

    assert(gateway, 'Push gateway URL is required');

    this.pushGateway = new Pushgateway(gateway, null, this.registry);

    this.push = async () => {
      try {
        await this.pushGateway.push({ jobName, groupings });
        this.monitor?.info('Metrics pushed to gateway successfully');
      } catch (err) {
        this.monitor?.reportError(`Metrics push failed: ${err.message}`);
        throw err;
      }
    };
  }

  /**
   * Clean up resources used by the plugin.
   * @returns {Promise<void>} Promise that resolves when cleanup is complete.
   */
  async terminate() {
    const promises = [];

    if (this.server) {
      promises.push(new Promise((resolve) => {
        this.server.close((err) => {
          if (err) {
            this.monitor?.reportError(`Error closing metrics server: ${err.message}`);
          }
          this.server = null;
          resolve();
        });
      }));
    }

    if (this.pushGateway) {
      try {
        await this.pushGateway.delete({ jobName: this.serviceName });
      } catch (err) {
        this.monitor?.reportError(`Failed to delete metrics from gateway during termination: ${err.message}`);
      }
      this.pushGateway = null;
    }

    await Promise.allSettled(promises);
  }

  /**
   * Normalize labels to ensure they match the expected label names and convert values to strings.
   * @param {Record<string, any>} labels - Labels object.
   * @param {string[]} expectedLabelNames - Expected label names array.
   * @returns {Record<string, string>} Normalized labels object with string values.
   * @private
   */
  _normalizeLabels(labels, expectedLabelNames) {
    const normalizedLabels = {};

    if (!expectedLabelNames || expectedLabelNames.length === 0) {
      return normalizedLabels;
    }

    if (labels && typeof labels === 'object') {
      for (const name of expectedLabelNames) {
        if (Object.prototype.hasOwnProperty.call(labels, name) && labels[name] !== undefined && labels[name] !== null) {
          normalizedLabels[name] = String(labels[name]);
        } else {
          normalizedLabels[name] = '';
        }
      }
    } else {
      for (const name of expectedLabelNames) {
        normalizedLabels[name] = '';
      }
    }

    return normalizedLabels;
  }
}

export default PrometheusPlugin;
