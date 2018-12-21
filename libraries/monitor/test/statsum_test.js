suite('Statsum', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let nock = require('nock');
  let authmock = require('./authmock');
  let libUrls = require('taskcluster-lib-urls');

  let monitor = null;

  suite('enabled', function() {
    let statsumScope = null;
    setup(async () => {
      authmock.setup();

      statsumScope = nock('https://statsum.taskcluster.net')
        .persist()
        .filteringRequestBody(/.*/, '*')
        .post(/v1\/project\/tc-lib-monitor/, '*')
        .reply(200, 'OK');

      setTimeout(function() {
        statsumScope.done();
      }, 2000);

      monitor = await monitoring({
        rootUrl: libUrls.testRootUrl(),
        projectName: 'tc-lib-monitor',
        credentials: {clientId: 'test-client', accessToken: 'test'},
        patchGlobal: false,
        reportStatsumErrors: false,
      });
    });

    teardown(async () => {
      authmock.teardown();
    });

    test('should have written', async function() {
      monitor.count('testing', 10);
      await monitor.flush();

      let pre = monitor.prefix('sub');
      pre.count('testing2', 100);
      await pre.flush();

      if (!statsumScope.isDone()) {
        return new Error('Error! Did not call' + statsumScope.pendingMocks());
      }
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

    test('should do nothing', async function() {
      monitor.count('things', 10);
      monitor.measure('length', 11);

      const sub = monitor.prefix('sub');
      sub.count('things', 10);
      sub.measure('length', 11);

      await monitor.flush();
    });
  });
});
