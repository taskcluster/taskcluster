let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
var taskcluster = require('taskcluster-client');
var raven = require('raven');
let Statsum = require('statsum');

class Monitor {

  constructor (authClient, sentryClient, statsumClient, opts) {
    this.opts = opts;
    this.auth = authClient;
    this.sentry = sentryClient;
    this.statsum = statsumClient;
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
    await this.statsum.flush();
  }

  prefix (prefix) {
    return new Monitor(
      this.auth,
      this.sentry,
      this.statsum.prefix(prefix),
      this.opts
    );
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
    patchGlobal: true,
    reportStatsumErrors: true,
  });

  let authClient = new taskcluster.Auth({
    credentials: options.credentials,
  });

  let statsumClient = new Statsum(
    async (project) => { return await authClient.statsumToken(project); },
    {
      project: opts.project,
      emitErrors: true,
    }
  );

  let sentryClient = await setupSentry(authClient, opts.project, opts.patchGlobal);

  if (opts.reportStatsumErrors) {
    statsumClient.on('error', (err) => {
      sentryClient.client.captureException(err, {level: 'warning'});
    });
  }

  return new Monitor(authClient, sentryClient, statsumClient, opts);
};

module.exports = monitor;
