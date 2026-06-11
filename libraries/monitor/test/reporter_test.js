import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import MonitorManager from '../src/monitormanager.js';

suite(testing.suiteName(), () => {

  suite('sentry', () => {
    let monitor, reported;
    setup(() => {
      reported = null;
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
          sentryOptions: {
            beforeSend(event) {
              reported = event;
              // Return null to prevent actual sending
              return null;
            },
          },
        },
      });
    });

    teardown(async () => {
      await monitor.terminate();
      reported = null;
    });

    test('simple error report', async () => {
      monitor.reportError(new Error('hi'));
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'error');
    });
    test('error report with level', async () => {
      monitor.reportError(new Error('hi'), 'notice');
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'info');
    });
    test('error report with tags', async () => {
      monitor.reportError(new Error('hi'), { baz: 'bing' });
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.tags.baz, 'bing');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'error');
    });
    test('error report with level and tags', async () => {
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
