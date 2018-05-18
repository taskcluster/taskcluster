/*
 * These are functions that are useful in many common use
 * cases within Taskcluster projects. They should take an
 * monitor to operate on as their first argument and return
 * a function so that the real and fake classes can share
 * them.
 */
const _ = require('lodash');
const debug = require('debug')('taskcluster-lib-monitor');
const Promise = require('bluebird');

/**
 * Given an express api method, this will time it
 * and report via the monitor.
 */
exports.expressMiddleware = (monitor, name) => {
  return (req, res, next) => {
    let sent = false;
    let start = process.hrtime();
    let send = () => {
      try {
        // Avoid sending twice
        if (sent) {
          return;
        }
        sent = true;

        let d = process.hrtime(start);

        let success = 'success';
        if (res.statusCode >= 500) {
          success = 'server-error';
        } else if (res.statusCode >= 400) {
          success = 'client-error';
        }

        for (let stat of [success, 'all']) {
          let k = [name, stat].join('.');
          monitor.measure(k, d[0] * 1000 + d[1] / 1000000);
          monitor.count(k);
        }
        monitor.measure(['all', success], d[0] * 1000 + d[1] / 1000000);
        monitor.count(['all', success]);
      } catch (e) {
        debug('Error while compiling response times: %s, %j', err, err, err.stack);
      }
    };
    res.once('finish', send);
    res.once('close', send);
    next();
  };
};

/**
 * Given a function that operates on a
 * single message, this will time it and
 * report via the monitor.
 */
exports.timedHandler = (monitor, name, handler) => {
  return async (message) => {
    let start = process.hrtime();
    let success = 'success';
    try {
      await handler(message);
    } catch (e) {
      success = 'error';
      throw e;
    } finally {
      let d = process.hrtime(start);
      for (let stat of [success, 'all']) {
        let k = [name, stat].join('.');
        monitor.measure(k, d[0] * 1000 + d[1] / 1000000);
        monitor.count(k);
      }
    }
  };
};

/**
 * Given a process name, this will report basic
 * OS-level usage statistics like CPU and Memory
 * on a minute-by-minute basis.
 *
 * Returns a function that can be used to stop monitoring.
 */
exports.resources = (monitor, proc, seconds) => {
  if (monitor._resourceInterval) {
    clearInterval(monitor._resourceInterval);
  }
  let lastCpuUsage = null;
  let lastMemoryUsage = null;

  let interval = setInterval(() => {
    lastCpuUsage = process.cpuUsage(lastCpuUsage);
    lastMemoryUsage = process.memoryUsage(lastMemoryUsage);

    monitor.measure('process.' + proc + '.cpu', _.sum(Object.values(lastCpuUsage)));
    monitor.measure('process.' + proc + '.cpu.user', lastCpuUsage.user);
    monitor.measure('process.' + proc + '.cpu.system', lastCpuUsage.system);
    monitor.measure('process.' + proc + '.mem', lastMemoryUsage.rss);
  }, seconds * 1000);

  monitor._resourceInterval = interval;
  return () => clearInterval(interval);
};

exports.timer = (monitor, prefix, funcOrPromise) => {
  let start = process.hrtime();
  let done = (x) => {
    let d = process.hrtime(start);
    monitor.measure(prefix, d[0] * 1000 + d[1] / 1000000);
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
};

exports.patchAWS = (monitor, service) => {
  monitor = monitor.prefix(service.serviceIdentifier);
  let makeRequest = service.makeRequest;
  service.makeRequest = function(operation, params, callback) {
    let r = makeRequest.call(this, operation, params, callback);
    r.on('complete', () => {
      let requestTime = (new Date()).getTime() - r.startTime.getTime();
      monitor.measure(`global.${operation}.duration`, requestTime);
      monitor.count(`global.${operation}.count`, 1);
      if (service.config && service.config.region) {
        let region = service.config.region;
        monitor.measure(`${region}.${operation}.duration`, requestTime);
        monitor.count(`${region}.${operation}.count`, 1);
      }
    });
    return r;
  };
};

/**
 * A TimeKeeper is used for measuring arbitrary times.  This is nice when the
 * action to time does not fit neatly into a single function or promise.  A
 * TimeKeeper should be created for each measurement and should only have its
 * measurement submitted a single time.  An exception will be thrown if you try
 * to submit the same doo dad twice.
 */
exports.TimeKeeper = class TimeKeeper {

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
    let d = process.hrtime(this.start);
    this.monitor.measure(this.name, d[0] * 1000 + d[1] / 1000000);
  }
};
