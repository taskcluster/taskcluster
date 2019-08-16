const {registerBuiltins} = require('../src/builtins');
const nock = require('nock');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const MonitorManager = require('../src/monitormanager');

suite(testing.suiteName(), function() {

  suite('sentry', function() {
    let monitorManager, monitor, scope;
    suiteSetup(function() {
      scope = nock('https://sentry.example.com')
        .post('/api/448/store/')
        .reply(200);

      monitorManager = new MonitorManager();
      registerBuiltins(monitorManager);
      monitor = monitorManager.configure({
        serviceName: 'testing-service',
      }).setup({
        level: 'debug',
        debug: true,
        fake: true,
        verify: true,
        errorConfig: {
          reporter: 'SentryReporter',
          dsn: 'https://fake123@sentry.example.com/448',
        },
      });
    });

    teardown(async function() {
      await monitor.terminate();
      assert(scope.isDone());
    });

    test('simple error report', async function() {
      monitor.reportError(new Error('hi'));
    });
  });
});
