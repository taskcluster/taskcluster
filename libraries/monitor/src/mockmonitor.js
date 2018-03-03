let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let utils = require('./utils');

class MockMonitor {
  constructor(opts, counts = {}, measures = {}, errors = [], records = []) {
    this._opts = opts;
    this.counts = counts;
    this.measures = measures;
    this.errors = errors;
    this.records = records;
    this._resourceInterval = null;
  }

  async reportError(err, level='error', tags={}) {
    debug('reportError: %s level=%s tags=%j', err, level, tags, err && err.stack);
    this.errors.push(err);
    return true;
  }

  log(record) {
    this.records.push(record);
  }

  async captureError(err, level='error', tags={}) {
    return this.reportError(err, level, tags);
  }

  count(key, val) {
    let k = this._key(key);
    debug('count %s by %s', k, val || 1);
    this.counts[k] = (this.counts[k] || 0) + (val || 1);
  }

  measure(key, val) {
    let k = this._key(key);
    assert(typeof val === 'number', 'Measurement value must be a number');
    debug('measure %s at %s', k, val);
    this.measures[k] = (this.measures[k] || []).concat(val);
  }

  timer(key, funcOrPromise) {
    return utils.timer(this, key, funcOrPromise);
  }

  timedHandler(name, handler) {
    return async (message) => { await handler(message); };
  }

  expressMiddleware(name) {
    return (req, res, next) => {
      next();
    };
  }

  _key(key) {
    let p = '.';
    if (this._opts.prefix) {
      p = this._opts.prefix + '.';
    }
    return this._opts.project + p + key;
  }

  async flush() {
    // Do nothing.
  }

  prefix(prefix) {
    let newopts = _.cloneDeep(this._opts);
    newopts.prefix = (this._opts.prefix || '')  + '.' + prefix;
    return new MockMonitor(
      newopts,
      this.counts,
      this.measures,
      this.errors
    );
  }

  timedHandler(name, handler) {
    return utils.timedHandler(this, name, handler);
  }

  timeKeeper(name) {
    return new utils.TimeKeeper(this, name);
  }

  expressMiddleware(name) {
    return utils.expressMiddleware(this, name);
  }

  resources(process, interval = 10) {
    this._opts.process = process;
    return utils.resources(this, process, interval);
  }

  stopResourceMonitoring() {
    clearInterval(this._resourceInterval);
  }

  patchAWS(service) {
    utils.patchAWS(this, service);
  }
}

module.exports = MockMonitor;
