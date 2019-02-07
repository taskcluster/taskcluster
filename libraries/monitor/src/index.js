const os = require('os');
const assert = require('assert');
const rootdir = require('app-root-dir');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const serializeError = require('serialize-error');
const Logger = require('./logger');
const TimeKeeper = require('./timekeeper');

class Monitor {
  constructor({
    projectName,
    patchGlobal = true,
    bailOnUnhandledRejection = false,
    resourceInterval = 10,
    mock = false,
    enable = true,
    gitVersionFile = '.git-version',
    processName = null,
    level = 'info',
    subject = 'root',
    metadata = {},
    pretty = false,
    destination = null,
    ...extra
  }) {
    assert(projectName, 'Must provide a project name (this is now `projectName` instead of `project`)');
    assert(!extra.credentials && !extra.statsumToken && !extra.sentryDSN, 'Credentials are no longer required for lib-monitor.');
    assert(!extra.process, 'monitor.process is now monitor.processName');

    this.projectName = projectName;
    this.mock = mock;
    this.subject = subject;
    this.level = level;
    this.metadata = metadata;
    this.bailOnUnhandledRejection = bailOnUnhandledRejection;

    if (level.includes(':')) {
      const levels = level.split(' ').reduce((o, conf) => {
        const c = conf.split(':');
        o[c[0]] = c[1];
        return o;
      }, {});
      assert(levels['root'], 'Must specify `root:` level if using child-specific levels.');
      if (levels[subject]) {
        level = levels[subject];
      } else {
        level = levels['root'];
      }
    }

    if (destination) {
      assert(destination.write, 'Must provide writeable stream as destination');
    } else if (mock) {
      this.events = [];
      destination = new stream.Writable({
        write: (chunk, encoding, next) => {
          try {
            chunk = JSON.parse(chunk);
          } catch (err) {
            if (err.name !== 'SyntaxError') {
              throw err;
            }
          }
          this.events.push(chunk);
          next();
        },
      });
    } else {
      destination = process.stdout;
    }
    this.destination = destination;

    // read gitVersionFile, if gitVersion is not set
    if (!metadata.gitVersion) {
      gitVersionFile = path.resolve(rootdir.get(), gitVersionFile);
      try {
        metadata.gitVersion = fs.readFileSync(gitVersionFile).toString().trim();
      } catch (err) {
        delete metadata.gitVersion;
      }
    }

    this.log = new Logger({
      name: `${projectName}.${subject}`,
      level,
      enable,
      pretty,
      destination,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });

    if (patchGlobal) {
      this.uncaughtExceptionHandler = this._uncaughtExceptionHandler.bind(this);
      process.on('uncaughtException', this.uncaughtExceptionHandler);

      this.unhandledRejectionHandler = this._unhandledRejectionHandler.bind(this);
      process.on('unhandledRejection', this.unhandledRejectionHandler);
    }

    if (processName) {
      this.resources(processName, resourceInterval);
    }
  }

  /*
   * Returns the raw logger if someone wants to do something strange with it.
   */
  logger() {
    return this.log;
  }

  debug(...args) {
    this.log.debug(...args);
  }

  info(...args) {
    this.log.info(...args);
  }

  notice(...args) {
    this.log.notice(...args);
  }

  warning(...args) {
    this.log.warning(...args);
  }

  err(...args) {
    this.log.err(...args);
  }

  crit(...args) {
    this.log.crit(...args);
  }

  alert(...args) {
    this.log.alert(...args);
  }

  emerg(...args) {
    this.log.emerg(...args);
  }

  _uncaughtExceptionHandler(err) {
    this.reportError(err);
    process.exit(1);
  }

  _unhandledRejectionHandler(reason, p) {
    const err = 'Unhandled Rejection at: Promise ' + p + ' reason: ' + reason;
    this.reportError(err);
    if (!this.bailOnUnhandledRejection) {
      return;
    }
    process.exit(1);
  }

  terminate() {
    this.stopResourceMonitoring();
    process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
    process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
    if (this.mock) {
      this.destination.end();
    }
  }

  /*
   * The most basic timer.
   */
  timer(key, funcOrPromise) {
    const start = process.hrtime();
    const done = (x) => {
      const d = process.hrtime(start);
      this.log.info('monitor.timer', {
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
          this.log.info('monitor.timedHandler', {
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

          let success = 'success';
          if (res.statusCode >= 500) {
            success = 'server-error';
          } else if (res.statusCode >= 400) {
            success = 'client-error';
          }

          this.log.info('monitor.express', {
            name,
            status: success,
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
    const monitor = this.prefix(service.serviceIdentifier);
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
      this.log.info('monitor.resources', {lastCpuUsage, lastMemoryUsage});
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
    } catch (error) {
      this.reportError({key, val, error});
      return;
    }
    this.log.info('monitor.count', {key, val});
  }

  /*
   * Simple measures. Generally should no longer be used. Prefer logging
   * specific types. Measures are designed to have percentiles taken over
   * them for monitoring purposes.
   */
  measure(key, val) {
    try {
      assert(typeof val === 'number', 'Measure values must be numbers');
    } catch (error) {
      this.reportError({key, val, error});
      return;
    }
    this.log.info('monitor.measure', {key, val});
  }

  /**
   * Take a standard error and break it up into loggable bits.
   */
  reportError(err) {
    if (!(err instanceof Error)) {
      err = new Error(err);
    }
    this.err('monitor.error', serializeError(err));
  }

  /**
   * Return a new monitor that will append a prefix to the logger name.
   * Useful for indicating that a message comes from an api rather than
   * a handler for instance.
   */
  prefix(pre, metadata = {}) {
    return new Monitor({
      projectName: this.projectName,
      subject: `${this.subject}.${pre}`,
      level: this.level,
      metadata: Object.assign({}, this.metadata, metadata),
      mock: this.mock,
      destination: this.destination,
      patchGlobal: false, // Handled by root
      processName: null, // Handled by root
    });
  }
}

module.exports = Monitor;
