const assert = require('assert');
const {serializeError} = require('serialize-error');
const {Logger} = require('./logger');
const TimeKeeper = require('./timekeeper');

class Monitor {
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

    this.log = {};
    Object.entries(this.manager.types).forEach(([name, meta]) => {
      this._register({name, ...meta});
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
    assert(name, 'Child monitor name is required');
    return new Monitor({
      manager: this.manager,
      name: this.name.concat([name]),
      metadata: {...this.metadata, ...metadata},
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

  /*
   * The most basic timer.
   */
  timer(key, funcOrPromise) {
    const start = process.hrtime();
    const done = (x) => {
      const d = process.hrtime(start);
      this.log.basicTimer({
        key,
        duration: d[0] * 1000 + d[1] / 1000000,
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
      const start = process.hrtime();
      let success = 'success';
      try {
        await handler(message);
      } catch (e) {
        success = 'error';
        throw e;
      } finally {
        const d = process.hrtime(start);
        this.log.handlerTimer({
          name,
          status: success,
          duration: d[0] * 1000 + d[1] / 1000000,
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
   * Patch an AWS service (an instance of a service from aws-sdk)
   */
  patchAWS(service) {
    const monitor = this;
    const makeRequest = service.makeRequest;
    service.makeRequest = function(operation, params, callback) {
      const r = makeRequest.call(this, operation, params, callback);
      r.on('complete', () => {
        const requestTime = (new Date()).getTime() - r.startTime.getTime();
        monitor.log.awsTimer({
          service: service.serviceIdentifier,
          operation,
          duration: requestTime,
          region: service.config ? service.config.region : undefined,
        });
      });
      return r;
    };
  }

  /**
   * Monitor a one-shot process.  This function's promise never resolves!
   * (except in testing, with MockMonitor)
   */
  async oneShot(name, fn) {
    let exitStatus = 0;
    const start = process.hrtime();
    try {
      assert.equal(typeof name, 'string');
      assert.equal(typeof fn, 'function');

      await fn();
    } catch (err) {
      this.reportError(err);
      exitStatus = 1;
    } finally {
      const d = process.hrtime(start);
      this.log.periodic({
        name,
        duration: d[0] * 1000 + d[1] / 1000000,
        status: exitStatus ? 'exception' : 'success',
      }, {level: exitStatus ? 'err' : 'notice'});
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
      this.reportError(err, {key, val});
      return;
    }
    this.log.countMetric({key, val});
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
      this.reportError(err, {key, val});
      return;
    }
    this.log.measureMetric({key, val});
  }

  /**
   * Take a standard error and break it up into loggable bits.
   *
   * * err: A string or Error object to be serialized and logged
   * * level: Kept around for legacy reasons, only added to fields
   * * extra: extra data to add to the serialized error
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
    const serialized = serializeError(err);
    if (this.manager._reporter) {
      extra['reportId'] = this.manager._reporter.report(err);
    }
    this.log.errorReport({...serialized, ...extra}, {level});
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
  }

  _register({name, type, version, level, fields}) {
    assert(!this[name], `Cannot override "${name}" as custom message type.`);
    const requiredFields = Object.keys(fields);
    this.log[name] = (fields={}, overrides={}) => {
      if (this.verify) {
        assert(level !== 'any' || overrides.level !== undefined, 'Must provide `overrides.level` if registered level is `any`.');
        const providedFields = Object.keys(fields);
        assert(!providedFields.includes('v'), '"v" is a reserved field for logging messages.');
        requiredFields.forEach(f => assert(providedFields.includes(f), `Log message "${name}" must include field "${f}".`));
      }
      let lv = level === 'any' ? overrides.level : level;
      this._log[lv](type, {v: version, ...fields});
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
      this.log.resourceMetrics({lastCpuUsage, lastMemoryUsage});
    }, interval * 1000);
  }
}

module.exports = Monitor;
