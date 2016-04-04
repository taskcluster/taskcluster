let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
var taskcluster = require('taskcluster-client');
var raven = require('raven');
let Statsum = require('statsum');

class Monitor {

  constructor (opts, authClient, sentryClient, statsumClient) {
    this.opts = opts;
    this.auth = authClient;
    this.sentry = sentryClient;
    this.statsum = statsumClient;
  }

  async reportError (err) {
    this.sentry = await setupSentry(
        this.auth,
        this.opts.project,
        this.opts.patchGlobal,
        this.sentry);
    this.sentry.client.captureException(err);
  }

  count (name, val) {
    this.statsum.count(name, val);
  }

  measure (name, val) {
    this.statsum.measure(name, val);
  }

  prefix (prefix) {
    assert(isinstance(prefix, basestring), 'New prefix must be a string');
    assert(prefix != '', 'New prefix must be non-empty!');
    newopts = _.cloneDeep(this.opts);
    return new Monitor(newopts, this.auth, this.sentry, this.statsum.prefix(prefix));
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

  let authClient = new taskcluster.Auth({
    credentials: options.credentials,
  });

  let statsumClient = new Statsum({
    project: opts.project,
    getToken: authClient.statsumToken,
    baseUrl: opts.statsumUrl,
  });

  let sentryClient = await setupSentry(authClient, opts.project, opts.patchGlobal);

  return new Monitor(opts, authClient, sentryClient, statsumClient);
};

module.exports = monitor;
