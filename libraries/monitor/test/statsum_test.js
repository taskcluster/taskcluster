suite('Statsum', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let nock = require('nock');
  let authmock = require('./authmock');

  let statsumScope = null;
  let monitor = null;

  setup(async () => {
    authmock.setup();

    statsumScope = nock('https://statsum.taskcluster.net')
      .persist()
      .filteringRequestBody(/.*/, '*')
      .post(/v1\/project\/tc-lib-monitor/, '*')
      .reply(200, 'OK');

    setTimeout(function () {
      statsumScope.done();
    }, 2000);

    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      patchGlobal: false,
      reportStatsumErrors: false,
    });
    setTimeout(function () {
      sentryNock.done();
    }, 2000);
  });

  teardown(async () => {
    authmock.teardown();
  });

  test('should have written', async function (done) {
    monitor.count('testing', 10);
    await monitor.flush();

    let pre = monitor.prefix('sub');
    pre.count('testing2', 100);
    await pre.flush();

    if (!statsumScope.isDone()) {
      done(new Error('Error! Did not call' + statsumScope.pendingMocks()));
    }
    done();
  });
});
