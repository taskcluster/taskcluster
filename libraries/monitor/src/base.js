const _ = require('lodash');
const debug = require('debug')('taskcluster-lib-monitor');

/**
 * A TimeKeeper is used for measuring arbitrary times.  This is nice when the
 * action to time does not fit neatly into a single function or promise.  A
 * TimeKeeper should be created for each measurement and should only have its
 * measurement submitted a single time.  An exception will be thrown if you try
 * to submit the same doo dad twice.
 */
class TimeKeeper {

  /**
   * Create a Timer and set the start time for the measurement.
   */
  constructor(monitor, name) {
    this.monitor = monitor;
    this.name = name;
    this.start = process.hrtime();
    this.submitted = false;
  }

  /**
   * Compare the start and end times then submit the value to the monitor for
   * records.
   */
  measure(force = false) {
    if (!force && this.submitted) {
      throw new Error('Cannot submit measurement twice for ' + this._opts.prefix + ' ' + this.name);
    }
    this.submitted = true;
    const d = process.hrtime(this.start);
    this.monitor.measure(this.name, d[0] * 1000 + d[1] / 1000000);
  }
};

class BaseMonitor {
  constructor() {
    this._procName = null;
    this._resourceInterval = null;
  }

  /**
   * captureError is an alias for reportError to match up
   * with the raven api better.  Subclasses provide reportError.
   */
  async captureError(err, level='error', tags={}) {
    return this.reportError(err, level, tags);
  }

  timer(key, funcOrPromise) {
    const start = process.hrtime();
    const done = (x) => {
      const d = process.hrtime(start);
      this.measure(key, d[0] * 1000 + d[1] / 1000000);
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
          this.measure(k, d[0] * 1000 + d[1] / 1000000);
          this.count(k);
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

          for (let stat of [success, 'all']) {
            const k = [name, stat].join('.');
            this.measure(k, d[0] * 1000 + d[1] / 1000000);
            this.count(k);
          }
          this.measure(['all', success], d[0] * 1000 + d[1] / 1000000);
          this.count(['all', success]);
        } catch (e) {
          debug('Error while compiling response times: %s, %j', err, err, err.stack);
        }
      };
      res.once('finish', send);
      res.once('close', send);
      next();
    };
  }

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
        monitor.measure(`global.${operation}.duration`, requestTime);
        monitor.count(`global.${operation}.count`, 1);
        if (service.config && service.config.region) {
          const region = service.config.region;
          monitor.measure(`${region}.${operation}.duration`, requestTime);
          monitor.count(`${region}.${operation}.count`, 1);
        }
      });
      return r;
    };
  }

  /**
   * Given a process name, this will report basic
   * OS-level usage statistics like CPU and Memory
   * on a minute-by-minute basis.
   *
   * Returns a function that can be used to stop monitoring.
   */
  resources(procName, interval = 10) {
    this._procName = procName;
    if (this._resourceInterval) {
      clearInterval(this._resourceInterval);
    }
    let lastCpuUsage = null;
    let lastMemoryUsage = null;

    this._resourceInterval = setInterval(() => {
      lastCpuUsage = process.cpuUsage(lastCpuUsage);
      lastMemoryUsage = process.memoryUsage(lastMemoryUsage);

      this.measure('process.' + procName + '.cpu', _.sum(Object.values(lastCpuUsage)));
      this.measure('process.' + procName + '.cpu.user', lastCpuUsage.user);
      this.measure('process.' + procName + '.cpu.system', lastCpuUsage.system);
      this.measure('process.' + procName + '.mem', lastMemoryUsage.rss);
    }, interval * 1000);

    return () => this.stopResourceMonitoring();
  }

  stopResourceMonitoring() {
    clearInterval(this._resourceInterval);
    this._resourceInterval = null;
  }
}

module.exports = BaseMonitor;
