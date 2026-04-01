import assert from 'assert';
import testing from '@taskcluster/lib-testing';
import MonitorManager from '../src/monitormanager.js';

suite(testing.suiteName(), function() {

  suite('sentry', function() {
    let monitor, reported;
    setup(function() {
      monitor = MonitorManager.setup({
        serviceName: 'testing-service',
        level: 'debug',
        processName: 'foo',
        debug: true,
        fake: true,
        verify: true,
        versionOverride: '123:foo',
        errorConfig: {
          reporter: 'SentryReporter',
          dsn: 'https://fake123@sentry.example.com/448',
          beforeSend(event) {
            reported = event;
            return null; // Drop the event; don't actually send it
          },
        },
      });
    });

    teardown(async function() {
      await monitor.terminate();
      reported = null;
    });

    test('simple error report', async function() {
      monitor.reportError(new Error('hi'));
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'error');
    });
    test('error report with level', async function() {
      monitor.reportError(new Error('hi'), 'notice');
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'info');
    });
    test('error report with tags', async function() {
      monitor.reportError(new Error('hi'), { baz: 'bing' });
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.tags.baz, 'bing');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'error');
    });
    test('error report with level and tags', async function() {
      monitor.reportError(new Error('hi'), 'warning', { baz: 'bing' });
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.tags.baz, 'bing');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'warning');
    });
  });
});
