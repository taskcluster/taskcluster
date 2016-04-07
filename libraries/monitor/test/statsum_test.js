suite('Statsum', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let nock = require('nock');
  let authmock = require('./authmock');

  let statsumScope = null;
  let monitor = null;

  suiteSetup(async () => {
    authmock.setup();

    statsumScope = nock('https://statsum.taskcluster.net')
      .filteringRequestBody(/.*/, '*')
      .post(/v1\/project\/tc-lib-monitor/, '*')
      .reply(200, 'OK');

    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      patchGlobal: false,
      reportStatsumErrors: false,
    });
  });

  suiteTeardown(async () => {
    authmock.teardown();
  });

  test('should have written to something', async function (done) {
    monitor.count('testing', 10);
    await monitor.flush();
    if (!statsumScope.isDone()) {
      done(new Error('Error! Did not call' + statsumScope.pendingMocks()));
    }
    done();
  });

});
