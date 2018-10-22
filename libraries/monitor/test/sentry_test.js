const assert = require('assert');
const Promise = require('bluebird');
const monitoring = require('../');
const debug = require('debug')('test');
const nock = require('nock');
const authmock = require('./authmock');
const capcon = require('capture-console');
const libUrls = require('taskcluster-lib-urls');

suite('Sentry', () => {
  let monitor = null;

  suite('enabled', function() {
    suiteSetup(async () => {
      authmock.setup();

      monitor = await monitoring({
        rootUrl: libUrls.testRootUrl(),
        projectName: 'tc-lib-monitor',
        credentials: {clientId: 'test-client', accessToken: 'test'},
        patchGlobal: false,
      });
    });

    suiteTeardown(() => {
      authmock.teardown();
    });

    test('should log to sentry', function(done) {

      const sentryScope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/12345/store/', '*')
        .twice()
        .reply(200, () => {
          debug('called Sentry.');
        })
        .post('/api/12345/store/', '*')
        .reply(200, () => {
          debug('called Sentry the correct amount of times.');
          done();
        });

      Promise.all([
        monitor.reportError('create sentry error test'),
        monitor.reportError('another time'),
        monitor.captureError('this is the same as reportError'),
      ]).then(results => assert.deepEqual(results, [true, true, true]));
    });

    test('should handle sentry error', async function() {
      let stdout = '';
      capcon.startIntercept(process.stdout, data => { stdout += data; });

      const sentryScope = nock('https://app.getsentry.com')
        .filteringRequestBody(/.*/, '*')
        .post('/api/12345/store/', '*')
        .reply(500, () => {
          debug('called Sentry, returned 500');
        });
      try {
        assert.equal(false, await monitor.reportError('stranger things'));
      } finally {
        capcon.stopIntercept(process.stdout);
      }

      assert(/failed to send exception to sentry/.test(stdout));
      assert(/Failed to log error to Sentry:/.test(stdout));
    });
  });

  suite('not enabled', function() {
    suiteSetup(async () => {
      monitor = await monitoring({
        rootUrl: libUrls.testRootUrl(),
        projectName: 'tc-lib-monitor',
        enable: false,
      });
    });

    test('should log to stdout', async function() {
      let stdout = '';
      capcon.startIntercept(process.stdout, data => { stdout += data; });

      try {
        await monitor.reportError(new Error('uhoh'));
      } finally {
        capcon.stopIntercept(process.stdout);
      }

      assert(/reportError/.test(stdout));
      assert(/Error: uhoh/m.test(stdout));
      assert(/sentry_test\.js/.test(stdout)); // check for stack trace
    });
  });
});
