let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
let taskcluster = require('taskcluster-client');
let raven = require('raven');
let Statsum = require('statsum');

class Monitor {

  constructor (authClient, sentry, statsumClient, opts) {
    this._opts = opts;
    this._auth = authClient;
    this._sentry = sentry; // This must be a Promise that resolves to {client, expires}
    this._statsum = statsumClient;

    if (opts.reportStatsumErrors) {
      this._statsum.on('error', err => this.reportError(err, 'warning'));
    }

    if (opts.patchGlobal) {
      process.on('uncaughtException', (err) => {
        console.log(err.stack);
        this.reportError(err);
        process.exit(1);
      });
      process.on('unhandledRejection', (reason, p) => {
        let err = 'Unhandled Rejection at: Promise ' + p + ' reason: ' + reason;
        console.log(err);
        this.reportError(err, 'warning');
      });
    }
  }

  async reportError (err, level='error') {
    this._sentry = this._sentry.then(async (sentry) => {
      if (!sentry.expires || Date.parse(sentry.expires) <= Date.now()) {
        let sentryInfo = await this._auth.sentryDSN(this._opts.project);
        return {
          client: new raven.Client(sentryInfo.dsn.secret),
          expires: sentryInfo.expires,
        };
      }
      return sentry;
    }).catch(err => {});

    this._sentry.then(sentry => {
      sentry.client.captureException(err, {level});
    });
  }

  count (key, val) {
    this._statsum.count(key, val || 1);
  }

  measure (key, val) {
    this._statsum.measure(key, val);
  }

  async flush () {
    await this._statsum.flush();
  }

  prefix (prefix) {
    return new Monitor(
      this._auth,
      this._sentry,
      this._statsum.prefix(prefix),
      _.cloneDeep(this._opts)
    );
  }
}

class MockMonitor {
  constructor (opts, counts = {}, measures = {}, errors = []) {
    this._opts = opts;
    this.counts = counts;
    this.measures = measures;
    this.errors = errors;
  }

  async reportError (err, level='error') {
    this.errors.push(err);
  }

  count (key, val) {
    let k = this._key(key);
    this.counts[k] = (this.counts[k] || 0) + (val || 1);
  }

  measure (key, val) {
    let k = this._key(key);
    assert(typeof val === 'number', 'Measurement value must be a number');
    this.measures[k] = (this.measures[k] || []).concat(val);
  }

  _key (key) {
    let p = '.';
    if (this._opts.prefix) {
      p = this._opts.prefix + '.';
    }
    return this._opts.project + p + key;
  }

  async flush () {
    // Do nothing.
  }

  prefix (prefix) {
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

async function monitor (options) {
  assert(options.credentials, 'Must provide taskcluster credentials!');
  assert(options.project, 'Must provide a project name!');
  let opts = _.defaults(options, {
    patchGlobal: true,
    reportStatsumErrors: true,
  });

  if (options.mock) {
    return new MockMonitor(opts);
  }

  let authClient = new taskcluster.Auth({
    credentials: options.credentials,
  });

  let statsumClient = new Statsum(
    project => authClient.statsumToken(project),
    {
      project: opts.project,
      emitErrors: opts.reportStatsumErrors,
    }
  );

  let sentry = Promise.resolve({client: null, expires: new Date(0)});

  return new Monitor(authClient, sentry, statsumClient, opts);
};

module.exports = monitor;
