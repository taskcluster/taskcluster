suite('Sentry', () => {
  let assert = require('assert');
  let Promise = require('bluebird');
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

  test('should log to sentry', async function (done) {

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

    setTimeout(function() {
      sentryScope.done();
    }, 2000);

    let results = await Promise.all([
      monitor.reportError('create sentry error test'),
      monitor.reportError('another time'),
      monitor.captureError('this is the same as reportError'),
    ]);
    assert.deepEqual(results, [true, true, true]);
  });

  test('should handle sentry error', async function (done) {

    let sentryScope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/12345/store/', '*')
      .reply(500, () => {
        debug('called Sentry, returned 500');
      });

    setTimeout(function() {
      sentryScope.done();
    }, 2000);

    done(assert.equal(false, await monitor.reportError('stranger things')));
  });

});
