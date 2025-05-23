import _ from 'lodash';
import assert from 'assert';
import { Logger } from './logger.js';
import TimeKeeper from './timekeeper.js';
import { hrtime } from 'process';

/**
* @typedef {object} MonitorOptions
* @property {import('./monitormanager.js').MonitorManager} manager
* @property {string[]} name
* @property {object} metadata
* @property {boolean} verify
* @property {boolean} fake
* @property {boolean} patchGlobal
* @property {boolean} bailOnUnhandledRejection
* @property {number} resourceInterval
* @property {string | null} processName
* @property {boolean} monitorProcess
*/

class Monitor {
  /**
   * @param {MonitorOptions} options
   */
  constructor({
    manager,
    name,
    metadata,
    verify,
    fake,
    patchGlobal,
    bailOnUnhandledRejection,
    resourceInterval,
    processName,
    monitorProcess,
  }) {
    this.manager = manager;
    this.name = name;
    this.metadata = metadata;
    this.verify = verify;
    this.fake = fake;
    this.bailOnUnhandledRejection = bailOnUnhandledRejection;
    this.processName = processName;

    this.log = {};
    Object.entries(this.manager.types).forEach(([_, meta]) => {
      this._register({ ...meta });
    });

    this._log = new Logger({
      name: ['taskcluster', this.manager.serviceName, ...this.name].join('.'),
      service: this.manager.serviceName,
      level: this.manager.levels[name.join('.')] || this.manager.levels['root'],
      destination: this.manager.destination,
      metadata,
      taskclusterVersion: this.manager.taskclusterVersion,
    });

    if (patchGlobal) {
      this._patchGlobal();
    }

    if (monitorProcess) {
      this._resources(processName, resourceInterval);
    }
  }

  debug(...args) {
    this._log.debug(...args);
  }

  info(...args) {
    this._log.info(...args);
  }

  notice(...args) {
    this._log.notice(...args);
  }

  warning(...args) {
    this._log.warning(...args);
  }

  err(...args) {
    this._log.err(...args);
  }

  crit(...args) {
    this._log.crit(...args);
  }

  alert(...args) {
    this._log.alert(...args);
  }

  emerg(...args) {
    this._log.emerg(...args);
  }

  /*
   * Get a prefixed child monitor
   */
  childMonitor(name, metadata = {}) {
    assert(name || Object.keys(metadata).length > 0, 'Child monitor name is required if no metadata');
    if (_.isString(name)) {
      name = this.name.concat([name]);
    } else {
      metadata = name;
      name = this.name;
    }
    return new Monitor({
      manager: this.manager,
      name,
      metadata: { ...this.metadata, ...metadata },
      verify: this.verify,
      fake: this.fake,

      // none of the global stuff happens on non-root monitors..
      patchGlobal: false,
      bailOnUnhandledRejection: false,
      resourceInterval: 0,
      processName: this.processName,
      monitorProcess: false,
    });
  }

  /**
   * Initiate metrics exposure with configured methods
   * Prometheus plugin will use server and push configurations to expose metrics
   *
   * @param {string} [exposedRegistry='default'] - Registry to expose
   */
  exposeMetrics(exposedRegistry = 'default') {
    if (!this.manager._prometheus) {
      this.info('Not exposing metrics as prometheus plugin has not been configured');
      return;
    }
    this.manager._prometheus.exposeMetrics(exposedRegistry);
  }

  /**
   * Increment a Prometheus counter metric
   * @param {string} name - Metric name
   * @param {number} [value=1] - Value to increment by
   * @param {Record<string, any>} [labels={}] - Labels to apply
   */
  increment(name, value = 1, labels = {}) {
    if (!this.manager._prometheus) {
      return;
    }
    this.manager._prometheus.increment(name, value, labels);

  }

  /**
   * Decrement a Prometheus gauge metric
   * @param {string} name - Metric name
   * @param {number} [value=1] - Value to decrement by
   * @param {Record<string, any>} [labels={}] - Labels to apply
   */
  decrement(name, value = 1, labels = {}) {
    if (!this.manager._prometheus) {
      return;
    }
    this.manager._prometheus.decrement(name, value, labels);
  }

  /**
   * Set a Prometheus gauge metric value
   * @param {string} name - Metric name
   * @param {number} value - Value to set
   * @param {Record<string, any>} [labels={}] - Labels to apply
   */
  set(name, value, labels = {}) {
    if (!this.manager._prometheus) {
      return;
    }
    this.manager._prometheus.set(name, value, labels);
  }

  /**
   * Observe a value for a Prometheus histogram or summary
   * @param {string} name - Metric name
   * @param {number} value - Value to observe
   * @param {Record<string, any>} [labels={}] - Labels to apply
   */
  observe(name, value, labels = {}) {
    if (!this.manager._prometheus) {
      return;
    }
    this.manager._prometheus.observe(name, value, labels);
  }

  /**
   * Start a timer for a Prometheus histogram or summary
   * @param {string} name - Metric name
   * @param {object} [labels={}] - Initial labels to apply
   * @returns {function} Function to call to end timing
   */
  startPromTimer(name, labels = {}) {
    if (!this.manager._prometheus) {
      return () => 0;
    }
    return this.manager._prometheus.startTimer(name, labels);
  }

  /**
   * push metrics if prometheus is enabled and push options are provided
   */
  async pushMetrics() {
    if (!this.manager._prometheus) {
      return;
    }
    await this.manager._prometheus.push();
  }

  taskclusterPerRequestInstance({ requestId, traceId }) {
    return this.childMonitor({ traceId, requestId });
  }

  /*
   * The most basic timer.
   */
  timer(key, funcOrPromise) {
    const start = hrtime.bigint();
    const done = () => {
      const end = hrtime.bigint();
      this.log.basicTimer({
        key,
        duration: Number(end - start) / 1e6, // in ms
      });
    };
    if (funcOrPromise instanceof Function) {
      try {
        funcOrPromise = funcOrPromise();
      } catch (e) {
        // If this is a sync function that throws, we let it...
        // We just remember to call done() afterwards
        done();
        throw e;
      }
    }
    Promise.resolve(funcOrPromise).then(done, done);
    return funcOrPromise;
  }

  /**
   * Given a function that operates on a single message, this will wrap it such
   * that it will time itself.
   */
  timedHandler(name, handler) {
    return async (message) => {
      const start = hrtime.bigint();
      let success = 'success';
      try {
        await handler(message);
      } catch (e) {
        success = 'error';
        throw e;
      } finally {
        const end = hrtime.bigint();
        this.log.handlerTimer({
          name,
          status: success,
          duration: Number(end - start) / 1e6, // in ms
        });
      }
    };
  }

  /*
   * Simply return a Timekeeper object
   */
  timeKeeper(name) {
    return new TimeKeeper(this, name);
  }

  /**
   * Monitor a one-shot process.  This function's promise never resolves!
   * (except in testing, with MockMonitor)
   *
   * @param {string} name
   * @param {() => Promise<void>} fn
   */
  async oneShot(name, fn) {
    let exitStatus = 0;
    const start = hrtime.bigint();
    try {
      assert.equal(typeof name, 'string');
      assert.equal(typeof fn, 'function');

      await fn();
    } catch (err) {
      this.reportError(err);
      exitStatus = 1;
    } finally {
      const end = hrtime.bigint();
      this.log.periodic({
        name,
        duration: Number(end - start) / 1e6, // in ms
        status: exitStatus ? 'exception' : 'success',
      }, { level: exitStatus ? 'err' : 'notice' });
      if (!this.fake || this.fake.allowExit) {
        await this._exit(exitStatus);
      }
    }
  }

  /*
   * Simple counts. Generally should no longer be used. Prefer logging
   * specific types. Counts are designed to be summed up in a time period
   * for monitoring purposes.
   */
  count(key, val) {
    val = val || 1;
    try {
      assert(typeof val === 'number', 'Count values must be numbers');
    } catch (err) {
      this.reportError(err, { key, val });
      return;
    }
    this.log.countMetric({ key, val });
  }

  /*
   * Simple measures. Generally should no longer be used. Prefer logging
   * specific types. Measures are designed to have percentiles taken over
   * them for monitoring purposes.
   */
  measure(key, val) {
    try {
      assert(typeof val === 'number', 'Measure values must be numbers');
    } catch (err) {
      this.reportError(err, { key, val });
      return;
    }
    this.log.measureMetric({ key, val });
  }

  /**
   * Take a standard error and break it up into loggable bits.
   *
   * @param {Error | string} err: A string or Error object to be serialized and logged
   * @param {string | Record<string, any>} [level]: Kept around for legacy reasons, only added to fields
   * @param {Record<string, any>} [extra]: extra data to add to the serialized error
   *
   */
  reportError(err, level = 'err', extra = {}) {
    if (!(Object.prototype.hasOwnProperty.call(err, 'stack') || Object.prototype.hasOwnProperty.call(err, 'message'))) {
      err = new Error(err);
    }
    if (typeof level !== 'string') {
      extra = level;
      level = 'err';
    }

    // serializing an arbitrary error object can result in a huge blob of JSON.
    // Instead, we take just the normal error properties (most of which are not
    // enumerable) as well as any top-level properties that have scalar values.
    const serialized = {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: err.code,
    };
    for (const [k, v] of Object.entries(err)) {
      if (typeof v === 'string' || typeof v === 'number') {
        serialized[k] = v;
      }
    }

    if (this.manager._reporter) {
      extra['reportId'] = this.manager._reporter.report(err, level, extra);
    }
    this.log.errorReport({ ...serialized, ...extra }, { level });
  }

  /**
   * Shut down this monitor (stop monitoring resources, in particular)
   */
  async terminate() {
    if (this._resourceInterval) {
      clearInterval(this._resourceInterval);
      this._resourceInterval = null;
    }

    if (this.patchGlobal) {
      process.removeListener('uncaughtException', this._uncaughtExceptionHandler);
      process.removeListener('unhandledRejection', this._unhandledRejectionHandler);
    }

    if (this.manager._reporter) {
      await this.manager._reporter.flush();
    }

    if (this.manager._prometheus) {
      await this.manager._prometheus.terminate();
    }
  }

  _register({ name, type, version, level, fields }) {
    assert(!this[name], `Cannot override "${name}" as custom message type.`);
    const requiredFields = Object.keys(fields);
    this.log[name] = (fields = {}, overrides = {}) => {
      if (this.verify) {
        assert(level !== 'any' || overrides.level !== undefined, 'Must provide `overrides.level` if registered level is `any`.');
        const providedFields = Object.keys(fields);
        assert(!providedFields.includes('v'), '"v" is a reserved field for logging messages.');
        requiredFields.forEach(f => assert(providedFields.includes(f), `Log message "${name}" must include field "${f}".`));
      }
      let lv = level === 'any' ? overrides.level : level;
      this._log[lv](type, { v: version, ...fields });
    };
  }

  _patchGlobal() {
    this.patchGlobal = true;

    this._uncaughtExceptionHandler = this._uncaughtExceptionHandler.bind(this);
    process.on('uncaughtException', this._uncaughtExceptionHandler);

    this._unhandledRejectionHandler = this._unhandledRejectionHandler.bind(this);
    process.on('unhandledRejection', this._unhandledRejectionHandler);
  }

  async _uncaughtExceptionHandler(err) {
    this.reportError(err);
    await this._exit(1);
  }

  async _unhandledRejectionHandler(reason, p) {
    this.reportError(reason);
    if (!this.bailOnUnhandledRejection) {
      return;
    }
    await this._exit(1);
  }

  async _exit(code) {
    if (this.manager._reporter) {
      await this.manager._reporter.flush();
    }
    process.exit(code);
  }

  /**
   * Given a process name, this will report basic
   * OS-level usage statistics like CPU and Memory
   * on a minute-by-minute basis.
   */
  _resources(procName, interval) {
    if (this._resourceInterval) {
      clearInterval(this._resourceInterval);
    }

    this._resourceInterval = setInterval(() => {
      const lastCpuUsage = process.cpuUsage();
      const lastMemoryUsage = process.memoryUsage();
      this.log.resourceMetrics({ lastCpuUsage, lastMemoryUsage });
    }, interval * 1000);
  }
}

export default Monitor;
