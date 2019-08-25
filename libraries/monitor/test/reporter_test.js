const {registerBuiltins} = require('../src/builtins');
const nock = require('nock');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const MonitorManager = require('../src/monitormanager');

suite(testing.suiteName(), function() {

  suite('sentry', function() {
    let monitorManager, monitor, scope, reported;
    suiteSetup(function() {
      scope = nock('https://sentry.example.com')
        .post('/api/448/store/')
        .reply(200, (_, report)=> {reported = report;});

      monitorManager = new MonitorManager();
      registerBuiltins(monitorManager);
      monitor = monitorManager.configure({
        serviceName: 'testing-service',
      }).setup({
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
    });
  });
});
