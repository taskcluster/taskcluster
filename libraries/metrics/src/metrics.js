import assert from 'assert';
import http from 'http';
import https from 'https';
import debugFactory from 'debug';
import { createMetricsServer } from './middleware.js';

const debug = debugFactory('taskcluster-lib-metrics');

/**
 * @typedef {object} MetricsConstructorOptions
 * @property {string} serviceName
 * @property {import('./registry.js').Registry} registry
 * @property {import('taskcluster-lib-monitor').Monitor | null} monitor
 */

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
 * @property {number | null} [interval] - Push interval in ms for long-running processes.
 */

/**
 * Class for managing Prometheus metrics.
 */
class Metrics {
  /** @type {string} */
  serviceName;
  /** @type {import('./registry.js').Registry} */
  registry;
  /** @type {http.Server | null} */
  server = null;
  /** @type {NodeJS.Timeout | null} */
  pushInterval = null;
  /** @type {(() => Promise<void>) | null} */
  push = null;
  /** @type {import('taskcluster-lib-monitor').Monitor | null} */
  monitor;

  /**
   * Creates a new Metrics instance.
   * @param {MetricsConstructorOptions} options - Options object.
   */
  constructor({
    serviceName,
    registry,
    monitor = null,
  }) {
    this.serviceName = serviceName;
    this.registry = registry;
    this.monitor = monitor;
  }

  /**
   * Increment a counter metric.
   * @param {string} name - Name of the counter metric.
   * @param {number} [value=1] - Value to increment by.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  increment(name, value = 1, labels = {}) {
    const metricInfo = this.registry.getMetric(name);
    assert(metricInfo.type === 'counter', `Cannot increment metric ${name} of type ${metricInfo.type}`);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.inc(this.#normalizeLabels(labels, metricInfo.labelNames), value);
    } else {
      metricInfo.metric.inc(value);
    }
  }

  /**
   * Decrement a gauge metric.
   * @param {string} name - Name of the gauge metric.
   * @param {number} [value=1] - Value to decrement by.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  decrement(name, value = 1, labels = {}) {
    const metricInfo = this.registry.getMetric(name);
    assert(metricInfo.type === 'gauge', `Cannot decrement metric ${name} of type ${metricInfo.type}`);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.dec(this.#normalizeLabels(labels, metricInfo.labelNames), value);
    } else {
      metricInfo.metric.dec(value);
    }
  }

  /**
   * Set the value of a gauge metric.
   * @param {string} name - Name of the gauge metric.
   * @param {number} value - Value to set.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  set(name, value, labels = {}) {
    const metricInfo = this.registry.getMetric(name);
    assert(metricInfo.type === 'gauge', `Cannot set metric ${name} of type ${metricInfo.type}`);

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.set(this.#normalizeLabels(labels, metricInfo.labelNames), value);
    } else {
      metricInfo.metric.set(value);
    }
  }

  /**
   * Observe a value for a histogram or summary metric.
   * @param {string} name - Name of the histogram or summary metric.
   * @param {number} value - Value to observe.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   */
  observe(name, value, labels = {}) {
    const metricInfo = this.registry.getMetric(name);
    assert(
      metricInfo.type === 'histogram' || metricInfo.type === 'summary',
      `Cannot observe metric ${name} of type ${metricInfo.type}`,
    );

    if (metricInfo.labelNames.length > 0) {
      metricInfo.metric.observe(this.#normalizeLabels(labels, metricInfo.labelNames), value);
    } else {
      metricInfo.metric.observe(value);
    }
  }

  /**
   * Start a timer for a histogram or summary metric.
   * The returned function should be called to record the duration.
   * @param {string} name - Name of the histogram or summary metric.
   * @param {Record<string, string | number | boolean>} [labels={}] - Labels for the metric.
   * @returns { (finalLabels?: Record<string, string | number | boolean>) => number } A function
   *                                     that when called will record the duration and return it.
   */
  startTimer(name, labels = {}) {
    const metricInfo = this.registry.getMetric(name);
    assert(
      metricInfo.type === 'histogram' || metricInfo.type === 'summary',
      `Cannot time metric ${name} of type ${metricInfo.type}`,
    );

    const appliedLabels = this.#normalizeLabels(labels, metricInfo.labelNames);

    if (metricInfo.labelNames.length > 0) {
      const end = metricInfo.metric.startTimer(appliedLabels);
      return (finalLabels) => {
        const finalCombinedLabels = finalLabels ? {
          ...appliedLabels,
          ...this.#normalizeLabels(finalLabels, metricInfo.labelNames),
        } : appliedLabels;
        return end(finalCombinedLabels);
      };
    }
    const end = metricInfo.metric.startTimer();
    return (finalLabels) => {
      // If there were no initial labelNames, finalLabels might still be relevant
      // if the metric was registered without them but used this way.
      // However, prom-client's startTimer without labels doesn't accept labels at end().
      // So we only pass them if labelNames exist.
      return end();
    };
  }

  /**
   * Reset a metric to its initial state.
   * Note: This typically resets all label combinations for the metric.
   * @param {string} name
   */
  reset(name) {
    const metricInfo = this.registry.getMetric(name);
    metricInfo.metric.reset();
    debug(`Reset metric ${name}`);
  }

  /**
   * Sets up an internal HTTP server for metrics.
   * @param {ServerOptions} [options={}]
   * @returns {http.Server}
   */
  #setupServer(options = {}) {
    this.server = createMetricsServer(this, options, this.monitor);
    return this.server;
  }

  /**
   * Sets up push mode to Prometheus PushGateway.
   * @param {PushOptions} options
   * @returns {(() => Promise<void>) | null} Push function
   */
  #setupPush(options) {
    const { gateway, jobName = this.serviceName, groupings = {}, interval = null } = options;

    assert(gateway, 'Push gateway URL is required');
    const parsedUrl = new URL(gateway);

    this.push = async () => {
      try {
        const metricsData = await this.registry.metrics();

        let path = `/metrics/job/${encodeURIComponent(jobName)}`;
        for (const [key, value] of Object.entries(groupings)) {
          path += `/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
        }

        const requestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
          path,
          method: 'POST',
          headers: {
            'Content-Type': this.registry.contentType(),
            'Content-Length': Buffer.byteLength(metricsData),
          },
        };

        return new Promise((resolve, reject) => {
          const req = (parsedUrl.protocol === 'https:' ? https : http).request(
            requestOptions,
            (res) => {
              let responseBody = '';
              res.on('data', (chunk) => {
                responseBody += chunk;
              });
              res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                  const errorMessage = `Push failed with status ${res.statusCode}${responseBody ? `: ${responseBody}` : ''}`;
                  reject(new Error(errorMessage));
                } else {
                  resolve();
                }
              });
            },
          );

          req.on('error', (err) => {
            reject(err);
          });

          req.write(metricsData);
          req.end();
        });
      } catch (err) {
        this.monitor?.reportError(`Failed to prepare or push metrics: ${err.message}`);
        throw err;
      }
    };

    if (interval && typeof interval === 'number' && interval > 0) {
      this.pushInterval = setInterval(async () => {
        if (this.push) {
          try {
            await this.push();
          } catch (err) {
            this.monitor?.reportError(`Auto-push failed: ${err.message}`);
          }
        }
      }, interval);
    } else if (interval) {
      this.monitor?.warning(`Invalid interval provided for metrics push: ${interval}. Auto-push disabled.`);
    }
    return this.push;
  }

  /**
   * Starts an internal HTTP server to expose metrics.
   * @param {ServerOptions} [options={}]
   * @returns {http.Server}
   */
  startHttpServer(options = {}) {
    if (this.server) {
      this.monitor?.err('Metrics server is already running. Returning existing server.');
      return this.server;
    }
    return this.#setupServer(options);
  }

  /**
   * Configures and starts pushing metrics to a Prometheus PushGateway.
   * If an interval is set, metrics will be pushed periodically.
   * If no interval is set, this method will attempt a single push immediately.
   * @param {PushOptions} options - Push options. Gateway URL is required.
   * @returns {Promise<void>} A promise that resolves when the push setup is complete
   *                          (and after the initial push if no interval is set),
   *                          or rejects if the initial push fails.
   */
  async startPushing(options) {
    if (this.pushInterval && options.interval && options.interval > 0) {
      console.warn('Metrics pushing with an interval is already configured. Re-call with interval=null or 0 for a single push, or terminate first.');
      return Promise.resolve();
    }

    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }

    this.#setupPush(options);

    if (this.push && (!options.interval || options.interval <= 0)) {
      try {
        await this.push(); // Initial push if no interval or interval is 0
      } catch (err) {
        this.monitor?.reportError(`Initial metrics push failed: ${err.message}`, options);
        throw err;
      }
    }
    return Promise.resolve();
  }

  /**
   * Stop the metrics server and push interval if they're running.
   * @returns {Promise<void>} Promise that resolves when shutdown is complete.
   */
  async terminate() {
    const promises = [];

    if (this.server) {
      promises.push(new Promise((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            this.monitor?.reportError(`Error closing metrics server: ${err.message}`);
          }
          this.server = null;
          resolve(false); // Resolve even if there was a close error, to not block other shutdowns
        });
      }));
    }

    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }

    if (this.push) {
      // Attempt a final push if a push function was configured (e.g. for cron jobs or final state)
      // This is especially useful if it was not an interval push, or if interval was long.
      debug('Attempting final metrics push before termination');
      promises.push(this.push().catch(err => {
        this.monitor?.reportError(`Final metrics push failed during termination: ${err.message}`);
        debug(`Cannot push final metrics: ${err.message}`);
        // Do not let final push failure prevent other shutdowns from being awaited.
      }));
      this.push = null;
    }

    await Promise.allSettled(promises);
  }

  /**
   * Normalize labels to ensure they match the expected label names and convert values to strings.
   * @param {Record<string, any>} labels
   * @param {string[]} expectedLabelNames
   * @returns {Record<string, string>} Normalized labels object with string values.
   */
  #normalizeLabels(labels, expectedLabelNames) {
    /** @type {Record<string, string>} */
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

export { Metrics };
