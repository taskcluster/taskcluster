suite('Sentry', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let nock = require('nock');
  let authmock = require('./authmock');

  let monitor = null;

  suiteSetup(async () => {
    authmock.setup();

    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      patchGlobal: false,
    });
  });

  suiteTeardown(() => {
    authmock.teardown();
  });

  test('should create sentry error', async function (done) {

    let sentryScope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/12345/store/', '*')
      .twice()
      .reply(200, () => {
        debug('called Sentry.');
      })
      .post('/api/12345/store/', '*')
      .reply(200, () => {
        debug('called Sentry the correct amount of times.');
        done();
      });

    setTimeout(function () {
      sentryScope.done();
    }, 2000);

    await monitor.reportError('create sentry error test');
    await monitor.reportError('another time');
    await monitor.captureError('this is the same as reportError');
  });

});
