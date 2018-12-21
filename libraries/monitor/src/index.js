let debug = require('debug')('taskcluster-lib-monitor');
let _ = require('lodash');
let assert = require('assert');
let taskcluster = require('taskcluster-client');
let utils = require('./utils');
let Statsum = require('statsum');
let MockMonitor = require('./mockmonitor');
let Monitor = require('./monitor');
let auditlogs = require('./auditlogs');
let rootdir = require('app-root-dir');
let fs = require('fs');
let path = require('path');

/**
 * Create a new monitor, given options:
 * {
 *   project: '...',
 *   patchGlobal:  true,
 *   bailOnUnhandledRejection: false,
 *   reportStatsumErrors: true,
 *   resourceInterval: 10, // seconds
 *   crashTimeout: 5 * 1000, //milliseconds
 *   mock: false,
 *   enable: true,
 *   credentials: {
 *     clientId:       '...',
 *     accessToken:    '...',
 *   },
 *   // If credentials aren't given, you must supply:
 *   statsumToken: async (project) => {token, expires, baseUrl}
 *   sentryDNS: async (project) => {dsn: {secret: '...'}, expires}
 *   // If you'd like to use the logging bits, you'll need to provide
 *   // s3 creds directly for now
 *   aws: {credentials: {accessKeyId, secretAccessKey}},
 *   logName: '', // name of audit log
 *   gitVersion: undefined, // git version (for correlating errors); or..
 *   gitVersionFile: '.git-version', // file containing git version (relative to app root)
 * }
 */
async function monitor(options) {
  options = _.defaults({}, options, {
    patchGlobal: true,
    bailOnUnhandledRejection: false,
    reportStatsumErrors: true,
    reportAuditLogErrors: true,
    resourceInterval: 10,
    crashTimeout: 5 * 1000,
    mock: false,
    enable: true,
    logName: null,
    aws: null,
    gitVersionFile: '.git-version',
  });
  assert(options.authBaseUrl || options.credentials || options.statsumToken && options.sentryDSN ||
         options.mock || !options.enable,
  'Must provide taskcluster credentials or authBaseUrl or sentryDSN and statsumToken');
  assert(options.project, 'Must provide a project name!');

  // Return mock monitor, if mocking
  if (options.mock) {
    return new MockMonitor(options);
  }

  // Find functions for statsum and sentry
  let statsumToken = options.statsumToken;
  let sentryDSN = options.sentryDSN;
  // Wrap statsumToken in function if it's not a function
  if (statsumToken && !(statsumToken instanceof Function)) {
    statsumToken = () => options.statsumToken;
  }
  // Wrap sentryDSN in function if it's not a function
  if (sentryDSN && !(sentryDSN instanceof Function)) {
    sentryDSN = () => options.sentryDSN;
  }
  // Use taskcluster credentials for statsumToken and sentryDSN, if given
  if (options.credentials || options.authBaseUrl) {
    let auth = new taskcluster.Auth({
      credentials: options.credentials,
      baseUrl: options.authBaseUrl,
    });
    if (!statsumToken) {
      statsumToken = project => auth.statsumToken(project);
    }
    if (!sentryDSN) {
      sentryDSN = project => auth.sentryDSN(project);
    }
  }

  let statsum;
  if (options.enable) {
    statsum = new Statsum(statsumToken, {
      project: options.project,
      emitErrors: options.reportStatsumErrors,
    });
  }

  let auditlog;
  if (options.enable && options.aws && options.logName) {
    auditlog = new auditlogs.FirehoseLog(Object.assign({}, options, {statsum}));
  } else {
    auditlog = new auditlogs.NoopLog();
  }
  await auditlog.setup();

  // read gitVersionFile, if gitVersion is not set
  let gitVersion;
  if (!options.gitVersion) {
    let gitVersionFile = path.resolve(rootdir.get(), options.gitVersionFile);
    try {
      options.gitVersion = fs.readFileSync(gitVersionFile).toString().trim();
    } catch (err) {
      // ignore error - we just get no gitVersion
    }
  }
  delete options.gitVersionFile;

  let m = new Monitor(sentryDSN, null, statsum, auditlog, options);

  if (statsum && options.reportStatsumErrors) {
    statsum.on('error', err => m.reportError(err, 'warning'));
  }
  if (options.reportAuditLogErrors) {
    auditlog.on('error', err => m.reportError(err, 'warning'));
  }

  registerSigtermHandler(async () => {
    setTimeout(() => {
      console.log('Failed to flush after timeout!');
      process.exit(1);
    }, options.crashTimeout);
    try {
      await m.flush();
    } catch (e) {
      console.log('Failed to flush  with error:');
      console.log(e);
    }
    process.exit(143); // Node docs specify that SIGTERM should exit with 128 + number of signal (SIGTERM is 15)
  });

  if (options.patchGlobal) {
    process.on('uncaughtException', async (err) => {
      console.log('Uncaught Exception! Attempting to report to Sentry and crash.');
      console.log(err.stack);
      setTimeout(() => {
        console.log('Failed to report error to Sentry after timeout!');
        process.exit(1);
      }, options.crashTimeout);
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
    process.on('unhandledRejection', async (reason, p) => {
      let err = 'Unhandled Rejection at: Promise ' + p + ' reason: ' + reason;
      console.log(err);
      if (!options.bailOnUnhandledRejection) {
        await m.reportError(err, 'error', {sort: 'unhandledRejection'});
        return;
      }
      setTimeout(() => {
        console.log('Failed to report error to Sentry after timeout!');
        process.exit(1);
      }, options.crashTimeout);
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
  }

  if (options.process) {
    utils.resources(m, options.process, options.resourceInterval);
  }

  return m;
};

// ensure that only one SIGTERM handler is registered at any time
let _sigtermHandler = null;
const registerSigtermHandler = sigtermHandler => {
  unregisterSigtermHandler();
  _sigtermHandler = sigtermHandler;
  process.on('SIGTERM', sigtermHandler);
};

const unregisterSigtermHandler = () => {
  if (_sigtermHandler) {
    process.removeListener('SIGTERM', _sigtermHandler);
    _sigtermHandler = null;
  }
};

module.exports = monitor;
