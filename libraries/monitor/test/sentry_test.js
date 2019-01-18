const assert = require('assert');
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
        assert.equal(false, await monitor.reportError(new Error('stranger things')));
      } finally {
        capcon.stopIntercept(process.stdout);
      }

      assert(/While trying to report.*stranger things/.test(stdout));
      assert(/reporting to sentry failed:/.test(stdout));
    });

    test('should handle DSN-fetching error', async function() {
      monitor = await monitoring({
        rootUrl: libUrls.testRootUrl(),
        projectName: 'tc-lib-monitor',
        sentryDSN: async () => { throw new Error('strange things'); },
        statsumToken: 'fake',
        patchGlobal: false,
      });

      let stdout = '';
      capcon.startIntercept(process.stdout, data => { stdout += data; });

      try {
        assert.equal(false, await monitor.reportError(new Error('strange things')));
      } finally {
        capcon.stopIntercept(process.stdout);
      }

      assert(/While trying to report.*strange things/.test(stdout));
      assert(/getting sentry DSN failed:/.test(stdout));
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
