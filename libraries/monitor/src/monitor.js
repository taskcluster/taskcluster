const assert = require('assert');
const serializeError = require('serialize-error');
const TimeKeeper = require('./timekeeper');

class Monitor {
  constructor({logger, types = {}}) {
    this._log = logger;
    this.log = {};
    Object.entries(types).forEach(([name, meta]) => {
      this.register({name, ...meta});
    });
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
   * Register a new logging type
   */
  register({name, type, version, level, fields}) {
    assert(!this[name], `Cannot override "${name}" as custom message type.`);
    this.log[name] = fields => {
      // TODO: In development (or perhaps on a flag), make assertions about input here
      this._log[level](type, {v: version, ...fields});
    };
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
        for (let stat of [success, 'all']) {
          const k = [name, stat].join('.');
          this._log.info('monitor.timedHandler', {
            key: k,
            duration: d[0] * 1000 + d[1] / 1000000,
          });
        }
      }
    };
  }

  /**
   * Given an express api method, this will time it
   * and report via the monitor.
   */
  expressMiddleware(name) {
    return (req, res, next) => {
      let sent = false;
      const start = process.hrtime();
      const send = () => {
        try {
          // Avoid sending twice
          if (sent) {
            return;
          }
          sent = true;

          const d = process.hrtime(start);

          this._log.info('monitor.express', {
            name,
            statusCode: res.statusCode,
            duration: d[0] * 1000 + d[1] / 1000000,
          });
        } catch (e) {
          this.reportError(err);
        }
      };
      res.once('finish', send);
      res.once('close', send);
      next();
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
        monitor.info('monitor.aws', {
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

    try {
      try {
        assert.equal(typeof name, 'string');
        assert.equal(typeof fn, 'function');

        await this.timer(name, fn);
      } catch (err) {
        this.reportError(err);
        exitStatus = 1;
      }
    } finally {
      if (!this.mock || this.mock.allowExit) {
        process.exit(exitStatus);
      }
    }
  }

  /**
   * Given a process name, this will report basic
   * OS-level usage statistics like CPU and Memory
   * on a minute-by-minute basis.
   *
   * Returns a function that can be used to stop monitoring.
   */
  resources(procName, interval = 10) {
    if (this._resourceInterval) {
      clearInterval(this._resourceInterval);
    }
    let lastCpuUsage = null;
    let lastMemoryUsage = null;

    this._resourceInterval = setInterval(() => {
      lastCpuUsage = process.cpuUsage(lastCpuUsage);
      lastMemoryUsage = process.memoryUsage(lastMemoryUsage);
      this._log.info('monitor.resources', {lastCpuUsage, lastMemoryUsage});
    }, interval * 1000);

    return () => this.stopResourceMonitoring();
  }

  stopResourceMonitoring() {
    if (this._resourceInterval) {
      clearInterval(this._resourceInterval);
      this._resourceInterval = null;
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
    this._log.info('monitor.count', {key, val});
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
    this._log.info('monitor.measure', {key, val});
  }

  /**
   * Take a standard error and break it up into loggable bits.
   *
   * * err: A string or Error object to be serialized and logged
   * * level: Kept around for legacy reasons, only added to fields
   * * extra: extra data to add to the serialized error
   *
   */
  reportError(err, level, extra = {}) {
    if (!(err instanceof Error)) {
      err = new Error(err);
    }
    if (level) {
      if (typeof level === 'string') {
        extra['legacyLevel'] = level;
      } else {
        extra = level;
      }
    }
    this.err('monitor.error', Object.assign({}, serializeError(err), extra));
  }
}

module.exports = Monitor;
