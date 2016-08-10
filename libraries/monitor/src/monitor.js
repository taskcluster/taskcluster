let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let Promise = require('promise');
let raven = require('raven');
let utils = require('./utils');

class Monitor {

  constructor(authClient, sentry, statsumClient, opts) {
    this._opts = opts;
    this._auth = authClient;
    this._sentry = sentry; // This must be a Promise that resolves to {client, expires}
    this._statsum = statsumClient;
    this._resourceInterval = null;
  }

  async reportError(err, level='error', tags={}) {
    if (!_.isString(level)) {
      tags = level;
      level = 'error';
    }
    this._sentry = this._sentry.then(async (sentry) => {
      if (!sentry.expires || Date.parse(sentry.expires) <= Date.now()) {
        let sentryInfo = await this._auth.sentryDSN(this._opts.project);
        return {
          client: new raven.Client(sentryInfo.dsn.secret),
          expires: sentryInfo.expires,
        };
      }
      return sentry;
    }).catch(err => {
      console.log('Failed to get access to sentry, err: %s, jsoN: %j', err.stack, err);
      return {client: null, expires: new Date(0)};
    });

    return this._sentry.then(sentry => {
      if (!sentry.client) {
        console.log('Can\'t report to sentry, error not reported: ', err.stack);
        return Promise.resolve();
      }

      sentry.client.captureException(err, {
        tags: _.defaults({
          prefix: this._opts.project + (this._opts.prefix || '.root'),
          process: this._opts.process || 'unknown',
        }, tags),
        level,
      });

      return new Promise((accept, reject) => {
        let onLogged, onError;
        onLogged = () => {
          sentry.client.removeListener('error', onError);
          accept(true);
        };
        onError = (e) => {
          sentry.client.removeListener('logged', onLogged);
          console.log('Failed to log error to Sentry: ' + e);
          accept(false);
        };
        sentry.client.once('logged', onLogged);
        sentry.client.once('error', onError);
      });
    });
  }

  // captureError is an alias for reportError to match up
  // with the raven api better.
  async captureError(err, level='error', tags={}) {
    return this.reportError(err, level, tags);
  }

  count(key, val) {
    this._statsum.count(key, val || 1);
  }

  measure(key, val) {
    this._statsum.measure(key, val);
  }

  async flush() {
    await this._statsum.flush();
  }

  prefix(prefix) {
    let newopts = _.cloneDeep(this._opts);
    newopts.prefix = (this._opts.prefix || '')  + '.' + prefix;
    return new Monitor(
      this._auth,
      this._sentry,
      this._statsum.prefix(prefix),
      newopts
    );
  }

  timer(key, funcOrPromise) {
    return utils.timer(this, key, funcOrPromise);
  }

  timedHandler(name, handler) {
    return utils.timedHandler(this, name, handler);
  }

  timeDooDad(name) {
    return new utils.TimeDooDad(this, name);
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

  /** Patch an AWS service (an instance of a service from aws-sdk) */
  patchAWS(service) {
    utils.patchAWS(this, service);
  }
}

module.exports = Monitor;
