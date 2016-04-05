let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
var taskcluster = require('taskcluster-client');
var raven = require('raven');
let Statsum = require('statsum');

class Monitor {

  constructor (opts) {
    this.opts = opts;
    this.auth = opts.authClient;
    this.sentry = opts.sentryClient;
    this.statsum = opts.statsumClient;
  }

  async reportError (err, level='error') {
    this.sentry = await setupSentry(
        this.auth,
        this.opts.project,
        this.opts.patchGlobal,
        this.sentry);
    this.sentry.client.captureException(err, {level});
  }

  count (key, val) {
    this.statsum.count(key, val);
  }

  measure (key, val) {
    this.statsum.measure(key, val);
  }

  async flush () {
    this.statsum.flush();
  }

  prefix (prefix) {
    assert(isinstance(prefix, basestring), 'New prefix must be a string');
    assert(prefix != '', 'New prefix must be non-empty!');
    newopts = _.cloneDeep(this.opts);
    newopts.statsum = newopts.statsum.prefix(prefix);
    return new Monitor(newopts);
  }
}

async function setupSentry (auth, project, patchGlobal, sentry = {}) {
  if (!sentry.expires || Date.parse(sentry.expires) <= Date.now()) {
    let sentryInfo = await auth.sentryDSN(project);
    sentry.client = new raven.Client(sentryInfo.dsn.secret);
    sentry.expires = sentryInfo.expires;
    if (patchGlobal) {
      sentry.client.patchGlobal(() => {
        console.log('Finished reporting fatal error to sentry. Exiting now.');
        process.exit(1);
      });
    }
  }
  return sentry;
}

async function monitor (options) {
  assert(options.credentials, 'Must provide taskcluster credentials!');
  let opts = _.defaults(options, {
    project: require(require('app-root-dir').get() + '/package.json').name,
    statsumUrl: 'https://statsum.taskcluster.net',
    patchGlobal: true,
  });

  if (!opts.authClient) {
    opts.authClient = new taskcluster.Auth({
      credentials: options.credentials,
    });
  }

  if (!opts.statsumClient) {
    opts.statsumClient = new Statsum({
      project: opts.project,
      getToken: opts.authClient.statsumToken,
      baseUrl: opts.statsumUrl,
    });
  }

  if (!opts.sentryClient) {
    opts.sentryClient = await setupSentry(opts.authClient, opts.project, opts.patchGlobal);
  }

  return new Monitor(opts);
};

module.exports = monitor;
