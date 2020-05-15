const nock = require('nock');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const MonitorManager = require('../src/monitormanager');

suite(testing.suiteName(), function() {

  suite('sentry', function() {
    let monitor, scope, reported;
    setup(function() {
      scope = nock('https://sentry.example.com')
        .post('/api/448/store/')
        .reply(200, (_, report)=> {reported = report;});

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
        },
      });
    });

    teardown(async function() {
      await monitor.terminate();
      reported = null;
      assert(scope.isDone());
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
      monitor.reportError(new Error('hi'), {baz: 'bing'});
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.tags.baz, 'bing');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'error');
    });
    test('error report with level and tags', async function() {
      monitor.reportError(new Error('hi'), 'warning', {baz: 'bing'});
      await monitor.terminate();
      assert.equal(reported.tags.service, 'testing-service');
      assert.equal(reported.tags.proc, 'foo');
      assert.equal(reported.tags.baz, 'bing');
      assert.equal(reported.release, '123:foo');
      assert.equal(reported.level, 'warning');
    });
  });
});
