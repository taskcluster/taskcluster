let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let Promise = require('promise');
let taskcluster = require('taskcluster-client');
let utils = require('./utils');
let Statsum = require('statsum');
let MockMonitor = require('./mockmonitor');
let Monitor = require('./monitor');

async function monitor(options) {
  assert(options.credentials, 'Must provide taskcluster credentials!');
  assert(options.project, 'Must provide a project name!');
  let opts = _.defaults(options, {
    patchGlobal: true,
    reportStatsumErrors: true,
    resourceInterval: 10 * 1000,
    crashTimeout: 5 * 1000,
  });

  if (opts.mock) {
    return new MockMonitor(opts);
  }

  let authClient = new taskcluster.Auth({
    credentials: opts.credentials,
  });

  let statsumClient = new Statsum(
    project => authClient.statsumToken(project),
    {
      project: opts.project,
      emitErrors: opts.reportStatsumErrors,
    }
  );

  let sentry = Promise.resolve({client: null, expires: new Date(0)});

  let m = new Monitor(authClient, sentry, statsumClient, opts);

  if (opts.reportStatsumErrors) {
    statsumClient.on('error', err => m.reportError(err, 'warning'));
  }

  if (opts.patchGlobal) {
    process.on('uncaughtException', async (err) => {
      console.log('Uncaught Exception! Attempting to report to Sentry and crash.');
      console.log(err.stack);
      setTimeout(() => {
        console.log('Failed to report error to Sentry after timeout!');
        process.exit(1);
      }, opts.crashTimeout);
      try {
        await m.reportError(err, 'fatal', {});
        console.log('Succesfully reported error to Sentry.');
      } catch (e) {
        console.log('Failed to report to Sentry with error:');
        console.log(e);
      } finally {
        process.exit(1);
      }
    });
    process.on('unhandledRejection', (reason, p) => {
      let err = 'Unhandled Rejection at: Promise ' + p + ' reason: ' + reason;
      console.log(err);
      m.reportError(err, 'warning');
    });
  }

  if (opts.process) {
    utils.resources(m, opts.process, opts.resourceInterval);
  }

  return m;
};

module.exports = monitor;
