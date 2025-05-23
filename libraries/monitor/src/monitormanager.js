import assert from 'assert';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import stream from 'stream';
import { LEVELS } from './logger.js';
import Monitor from './monitor.js';
import chalk from 'chalk';
import Debug from 'debug';
import plugins from './plugins/index.js';
import { cleanupDescription } from './util.js';

const __dirname = new URL('.', import.meta.url).pathname;
const REPO_ROOT = path.join(__dirname, '../../../');

const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

const LEVELS_REVERSE_COLOR = [
  chalk.red.bold('EMERGENCY'),
  chalk.red.bold('ALERT'),
  chalk.red.bold('CRITICAL'),
  chalk.red('ERROR'),
  chalk.yellow('WARNING'),
  chalk.blue('NOTICE'),
  chalk.green('INFO'),
  chalk.magenta('DEBUG'),
];

const mmDebug = Debug('taskcluster-lib-monitor.MonitorManager');

/** @typedef {import('./plugins/prometheus.js').MetricDefinition} MetricDefinition */

/**
 * @typedef {object} LogTypeOptions
 * @property {string} name - The name of the log type
 * @property {string} type - The type of the log type - will be logged as {type} field
 * @property {string} title - The title of the log type
 * @property {string} description - A description of the log type
 * @property {'any' | 'emerg' | 'alert' | 'crit' | 'err' | 'warn' | 'notice' | 'info' | 'debug'} level
 *   - The level of the log type
 * @property {number} version - The version of the log type
 * @property {Record<string,string>} fields - An object containing allowed fields
 * @property {string} [serviceName] - The name of the service
 */

/**
 * @typedef {object} MonitorManagerSetupOptions
 * @property {string} serviceName - The name of the service
 * @property {'info' | string} [level='info'] - The level to report logs at
 * @property {boolean} [patchGlobal=true] - If true, the monitor will patch global console methods
 * @property {string | null} [processName=null] - The name of the process
 * @property {boolean} [monitorProcess=false] - If true, the monitor will record system resource usage
 * @property {number} [resourceInterval=60] - Interval in seconds to monitor resource usage
 * @property {boolean} [bailOnUnhandledRejection=true] - If true, the monitor will crash on unhandled rejections
 * @property {boolean} [fake=false] - If true, the monitor will not actually report data
 * @property {object} [metadata={}] - Additional metadata to include in all records
 * @property {boolean} [debug=false] - If true, prints logs to stdout rather than reporting them
 * @property {stream.Writable | null} [destination=null] - The destination stream to write logs to
 * @property {boolean} [verify=false] - If true, verifies record against schema before logging
 * @property {{ reporter: 'SentryReporter' | 'TestReporter' } | null} [errorConfig=null] - Configuration
 *   for error handling (depends on reporter)
 * @property {string | null} [versionOverride=null] - Version to use instead of reading from version.json
 * @property {Omit<import('./plugins/prometheus.js').PrometheusOptions, 'serviceName'> | null} [prometheusConfig=null] -
 *   Configuration for Prometheus metrics
 */

export class MonitorManager {
  /** @type {Record<string, LogTypeOptions>} */
  static #registeredTypes = {};
  /** @type {Record<string, MetricDefinition>} */
  static #registeredMetrics = {};

  // initialized in setup
  /** @type {Record<string, LogTypeOptions>} */
  types = {};
  /** @type {Record<string, MetricDefinition>} */
  metrics = {};
  /** @type {string} */
  serviceName;
  /** @type {string} */
  taskclusterVersion;
  /** @type {import('./plugins/testreporter.js').TestReporter | import('./plugins/sentry.js').SentryReporter} */
  _reporter;
  /** @type {import('./plugins/prometheus.js').PrometheusPlugin} */
  _prometheus;
  V;

  /**
   * Register a new metric.
   * @param {MetricDefinition} options
   */
  static registerMetric({
    name,
    type,
    title,
    description,
    labels = {},
    registers = ['default'],
    buckets = undefined,
    percentiles = undefined,
    serviceName = undefined,
  }) {
    assert(name, `Must provide a name for this metric ${name}`);
    assert(/^[a-z][a-zA-Z0-9_]*$/.test(name), `Invalid metric name ${name}`);
    assert(METRIC_TYPES.includes(type),
      `Invalid metric type ${type}. Must be one of: counter, gauge, histogram, summary`);
    assert(title, `Must provide a title for metric ${name}`);
    assert(description, `Must provide a description for metric ${name}`);
    assert(Array.isArray(registers) && registers.length > 0, 'Must provide at least one register');

    const key = serviceName ? `${serviceName}:${name}` : name;

    if (MonitorManager.#registeredMetrics[key]) {
      throw new Error(`Cannot register metric ${name} twice`);
    }

    Object.keys(labels).forEach(label => {
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

    mmDebug(`registering metric ${name} ${serviceName ? `for service ${serviceName}` : 'globally'}`);

    MonitorManager.#registeredMetrics[key] = {
      name,
      type,
      title,
      description: cleanupDescription(description),
      labels,
      buckets,
      percentiles,
      serviceName,
      registers,
    };
  }

  /**
   * Register a new log message type.
   * @param {LogTypeOptions} options
   */
  static register({
    name,
    type,
    title,
    level,
    version,
    description,
    fields = {},
    serviceName,
  }) {
    assert(title, `Must provide a human readable title for this log type ${name}`);
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `Invalid name type ${name}`);
    assert(/^[a-z][a-zA-Z0-9.\-_]*$/.test(type), `Invalid event type ${type}`);
    assert(!MonitorManager.#registeredTypes[name], `Cannot register event ${name} twice`);
    assert(level === 'any' || LEVELS[level] !== undefined, `${level} is not a valid level.`);
    assert(Number.isInteger(version), 'Version must be an integer');
    assert(!fields['v'], '"v" is a reserved field for messages');
    /** @type {Record<string, string>} */
    const cleaned = {};
    Object.entries(fields).forEach(([field, desc]) => {
      assert(/^[a-zA-Z0-9_]+$/.test(name), `Invalid field name ${name}.${field}`);
      cleaned[field] = cleanupDescription(desc);
    });
    mmDebug(`registering log type ${name} ${serviceName ? `for service ${serviceName}` : 'for all services'}`);
    MonitorManager.#registeredTypes[name] = {
      name,
      type,
      title,
      level,
      version,
      description: cleanupDescription(description),
      fields: cleaned,
      serviceName,
    };
  }

  /**
   * Set up an instance for production use.  This returns a root monitor
   * which can be used to create child monitors.
   *
   * @param {MonitorManagerSetupOptions} options
   */
  static setup({
    serviceName,
    level = 'info',
    patchGlobal = true,
    processName = null,
    monitorProcess = false,
    resourceInterval = 60,
    bailOnUnhandledRejection = true,
    fake = false,
    metadata = {},
    debug = false,
    destination = null,
    verify = false,
    errorConfig = null,
    versionOverride = null,
    prometheusConfig = null,
  }) {
    assert(serviceName, 'Must provide a serviceName to MonitorManager.setup');

    const manager = new MonitorManager();

    manager.types = MonitorManager._typesForService(serviceName);
    manager.metrics = MonitorManager._metricsForService(serviceName);
    manager.serviceName = serviceName;

    // read dockerflow version file, if taskclusterVersion is not set
    if (manager.taskclusterVersion === undefined) {
      const taskclusterVersionFile = path.join(REPO_ROOT, 'version.json');
      try {
        manager.taskclusterVersion = JSON.parse(fs.readFileSync(taskclusterVersionFile).toString()).version;
      } catch (err) {
        // Do nothing, will just be undefined
      }
    }

    // in fake mode, don't monitor resources and errors
    if (fake) {
      patchGlobal = false;
      monitorProcess = false;
    }

    if (versionOverride) {
      manager.taskclusterVersion = versionOverride;
    }

    if (errorConfig) {
      if (!Object.keys(plugins.errorPlugins).includes(errorConfig.reporter)) {
        throw new Error(`Error reporter plugin ${errorConfig.reporter} does not exist.`);
      }
      manager._reporter = new plugins.errorPlugins[errorConfig.reporter]({
        ...errorConfig,
        serviceName: manager.serviceName,
        taskclusterVersion: manager.taskclusterVersion,
        processName,
      });
    }

    const levels = {};
    if (level.includes(':')) {
      level.split(' ').reduce((o, conf) => {
        const c = conf.split(':');
        o[c[0]] = c[1];
        return o;
      }, levels);
      assert(levels['root'], 'Must specify `root:` level if using child-specific levels.');
    } else {
      levels['root'] = level;
    }
    manager.levels = levels;

    manager.fake = fake;
    manager.destination = destination;
    manager.debug = debug;
    if (destination) {
      assert(!fake && !debug, 'Cannot use fake/debug with a destination');
      assert(destination.write, 'Must provide writeable stream as destination');
    } else if (fake || debug) {
      manager.messages = [];
      manager.destination = new stream.Writable({
        write: (chunk, encoding, next) => {
          manager._handleMessage(JSON.parse(chunk));
          next();
        },
      });
    } else {
      manager.destination = process.stdout;
    }

    const monitor = new Monitor({
      manager,
      name: [],
      metadata,
      verify,
      fake,
      patchGlobal,
      bailOnUnhandledRejection,
      resourceInterval,
      processName,
      monitorProcess,
    });

    if (prometheusConfig) {
      manager._prometheus = new plugins.metricsPlugins.PrometheusPlugin({
        serviceName: manager.serviceName,
        ...prometheusConfig,
      });

      // Initialize registered metrics once in manager
      Object.entries(manager.metrics).forEach(([_, definition]) => {
        manager._prometheus.registerMetric(definition.name, definition);
      });
      // Prometheus client needs monitor to report errors
      manager._prometheus.init(monitor);
    }

    return monitor;
  }

  /*
   * For use in testing only. Clears the events so this can be used again.
   */
  reset() {
    this.messages.splice(0);
  }

  /**
   * Generate log message documentation
   * @param {string} serviceName
   */
  static reference(serviceName) {
    assert(serviceName, "serviceName is required");
    const types = MonitorManager._typesForService(serviceName);

    return {
      serviceName: serviceName,
      $schema: '/schemas/common/logs-reference-v0.json#',
      types: Object.entries(types).map(([name, type]) => {
        return {
          name,
          ..._.omit(type, ['serviceName']),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Generate metrics documentation
   * @param {string} serviceName
   */
  static metricsReference(serviceName) {
    assert(serviceName, "serviceName is required");
    const metrics = MonitorManager._metricsForService(serviceName);

    return {
      serviceName: serviceName,
      $schema: '/schemas/common/metrics-reference-v0.json#',
      metrics: Object.entries(metrics).map(([name, metric]) => {
        return {
          name,
          ..._.omit(metric, ['serviceName']),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Return the log types for the given serviceName
   * @param {string} serviceName
   */
  static _typesForService(serviceName) {
    return Object.assign(
      {},
      ...Object.entries(MonitorManager.#registeredTypes)
        .filter(([_, { serviceName: sn }]) => !sn || sn === serviceName)
        .map(([k, v]) => ({ [k]: v })));
  }

  /**
   * Return the metrics for the given serviceName
   * @param {string} serviceName
   */
  static _metricsForService(serviceName) {
    return Object.assign(
      {},
      ...Object.entries(MonitorManager.#registeredMetrics)
        .filter(([_, { serviceName: sn }]) => !sn || sn === serviceName)
        .map(([k, v]) => ({ [k]: v })));
  }

  /**
   * Handle a message from any logger. This is only used in testing
   * and development.
   */
  _handleMessage({ Type, Fields, Logger, Severity, severity, message }) {
    if (this.fake) {
      this.messages.push({ Type, Fields, Logger, Severity });
    }
    if (this.debug) {
      message = message ? message.toString().replace(/\n/g, '\\n') : '';
      const extra = Object.keys(Fields).reduce((s, f) =>
        s + chalk`\n\t{gray ${f}:} ${String(Fields[f]).replace(/\n/g, '\\n')}`, '');
      const line = chalk`${LEVELS_REVERSE_COLOR[Severity]}: {gray ${Type}}: ${message}${extra}`;
      Debug(Logger)(line);
    }
  }
}

export default MonitorManager;
