const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['gcp'], function(mock, skipping) {
  if (!mock) {
    return; // We don't test this with real credentials for now!
  }
  suite('regular SentryManager with fake client', function() {
    helper.withCfg(mock, skipping);
    helper.withSentry(mock, skipping);
    helper.withPulse('mock', skipping);
    helper.withEntities('mock', skipping);
    helper.withRoles('mock', skipping);
    helper.withServers(mock, skipping);

    test('sentryDSN api method', async () => {
      await helper.apiClient.sentryDSN('playground');
    });

    test('purgeExpiredKeys', async () => {
      let sentryManager = await helper.load('sentryManager', helper.overwrites);

      // There shouldn't be any keys that'll expire from this
      // As keys shouldn't have been any keys created 100 years ago
      // This tests that we don't just purge all keys, but only the ones expired.
      let farInThePast = taskcluster.fromNow('- 100 years');
      let expired = await sentryManager.purgeExpiredKeys(farInThePast);
      assert(expired === 0, 'Didn\'t expect any keys to expire!');

      // There should be keys expired, when we expire 7 days into the future
      // we should at least see the key from the test case above be expired
      let aWeekFromNow = taskcluster.fromNow('7 days');
      expired = await sentryManager.purgeExpiredKeys(aWeekFromNow);
      assert(expired > 0, 'Expected at least one key to be expired');
    });
  });

  suite('NullSentryManager', function() {
    suiteSetup('zero out sentry config', function() {
      helper.load.cfg('app.sentry', {});
    });
    helper.withCfg(mock, skipping);
    helper.withSentry(mock, skipping);
    helper.withPulse('mock', skipping);
    helper.withEntities('mock', skipping);
    helper.withRoles('mock', skipping);
    helper.withServers(mock, skipping);

    test('sentryDSN api method', async () => {
      await assert.rejects(
        () => helper.apiClient.sentryDSN('playground'),
        err => err.statusCode === 404);
    });

    test('purgeExpiredKeys', async function() {
      const sm = await helper.load('sentryManager');
      assert.strictEqual(await sm.purgeExpiredKeys(), 0);
    });
  });
});
