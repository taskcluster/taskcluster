let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let utils = require('./utils');
let BaseMonitor = require('./base');

class MockMonitor extends BaseMonitor {
  constructor(opts, counts = {}, measures = {}, errors = [], records = []) {
    super();
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

  _key(key) {
    let p = '.';
    if (this._opts.prefix) {
      p = this._opts.prefix + '.';
    }
    return this._opts.projectName + p + key;
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

}

module.exports = MockMonitor;
