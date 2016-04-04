suite('Sentry', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let config = require('typed-env-config');

  let monitor = null;
  let cfg = config();

  test('should create sentry error', async function (done) {
    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: cfg.taskcluster.credentials,
    });

    monitor.sentry.client.on('logged', () => done);
    monitor.sentry.client.on('error', done);

    await monitor.reportError(new Error('create sentry error test'));

    // Give this time to write. This will exit earlier if the error was
    // succesfully logged or an error occured.
    setTimeout(done, 2500);
  });

});
