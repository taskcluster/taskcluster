import assert from 'assert';
import testing from '@taskcluster/lib-testing';
import MonitorManager from '../src/monitormanager.js';

/**
 * Creates a custom Sentry transport that captures event envelopes in-memory.
 * Sentry v10 sends envelopes (newline-delimited JSON) instead of plain JSON.
 */
function makeTestTransport(captured) {
  return (options) => {
    return {
      send(envelope) {
        const [, items] = envelope;
        for (const [itemHeader, payload] of items) {
          if (itemHeader.type === 'event') {
            captured.event = payload;
          }
        }
        return Promise.resolve({ statusCode: 200 });
      },
      flush() {
        return Promise.resolve(true);
      },
    };
  };
}

suite(testing.suiteName(), function() {

  suite('sentry', function() {
    let monitor, captured;
    setup(function() {
      captured = {};

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
          transport: makeTestTransport(captured),
        },
      });
    });

    teardown(async function() {
      await monitor.terminate();
    });

    test('simple error report', async function() {
      monitor.reportError(new Error('hi'));
      await monitor.terminate();
      assert.equal(captured.event.tags.service, 'testing-service');
      assert.equal(captured.event.tags.proc, 'foo');
      assert.equal(captured.event.release, '123:foo');
      assert.equal(captured.event.level, 'error');
    });
    test('error report with level', async function() {
      monitor.reportError(new Error('hi'), 'notice');
      await monitor.terminate();
      assert.equal(captured.event.tags.service, 'testing-service');
      assert.equal(captured.event.tags.proc, 'foo');
      assert.equal(captured.event.release, '123:foo');
      assert.equal(captured.event.level, 'info');
    });
    test('error report with tags', async function() {
      monitor.reportError(new Error('hi'), { baz: 'bing' });
      await monitor.terminate();
      assert.equal(captured.event.tags.service, 'testing-service');
      assert.equal(captured.event.tags.proc, 'foo');
      assert.equal(captured.event.tags.baz, 'bing');
      assert.equal(captured.event.release, '123:foo');
      assert.equal(captured.event.level, 'error');
    });
    test('error report with level and tags', async function() {
      monitor.reportError(new Error('hi'), 'warning', { baz: 'bing' });
      await monitor.terminate();
      assert.equal(captured.event.tags.service, 'testing-service');
      assert.equal(captured.event.tags.proc, 'foo');
      assert.equal(captured.event.tags.baz, 'bing');
      assert.equal(captured.event.release, '123:foo');
      assert.equal(captured.event.level, 'warning');
    });
  });
});
