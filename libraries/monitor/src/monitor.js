let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
let taskcluster = require('taskcluster-client');
let raven = require('raven');
let usage = require('usage');
let Statsum = require('statsum');

class Monitor {

  constructor (authClient, sentry, statsumClient, opts) {
    this._opts = opts;
    this._auth = authClient;
    this._sentry = sentry; // This must be a Promise that resolves to {client, expires}
    this._statsum = statsumClient;

    if (!opts.isPrefixed && opts.reportStatsumErrors) {
      this._statsum.on('error', err => this.reportError(err, 'warning'));
    }

    if (!opts.isPrefixed && opts.patchGlobal) {
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

    if (!opts.isPrefixed && opts.reportUsage) {
      setInterval(() => {
        usage.lookup(process.pid, {keepHistory: true}, (err, result) => {
          if (err) {
            debug('Failed to get usage statistics, err: %s, %j',  err, err, err.stack);
            return;
          }
          this.measure('cpu', result.cpu);
          this.measure('mem', result.memory);
        });
      }, 60 * 1000);
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

  // captureError is an alias for reportError to match up
  // with the raven api better.
  async captureError (err, level='error') {
    this.reportError(err, level);
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
    let newopts = _.cloneDeep(this._opts);
    newopts.isPrefixed = true;
    return new Monitor(
      this._auth,
      this._sentry,
      this._statsum.prefix(prefix),
      newopts
    );
  }

  // Given a function that operates on a
  // single message, this will time it and
  // report to statsum.
  timedHandler (name, handler) {
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
          this.measure(k, d[0] * 1000 + d[1] / 1000000);
          this.count(k);
        }
      }
    };
  }

  // Given an express api method, this will time it
  // and report to statsum.
  expressMiddleware (name) {
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
            this.measure(k, d[0] * 1000 + d[1] / 1000000);
            this.count(k);
          }
        } catch (e) {
          debug('Error while compiling response times: %s, %j', err, err, err.stack);
        }
      };
      res.once('finish', send);
      res.once('close', send);
      next();
    };
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

  async captureError (err, level='error') {
    this.reportError(err, level);
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

  timedHandler (name, handler) {
    return async (message) => { await handler(message); };
  }

  expressMiddleware (name) {
    return (req, res, next) => {
      next();
    };
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
    reportUsage: true,
    isPrefixed: false,
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
