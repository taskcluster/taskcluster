const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const { setSetupRetryInterval } = require('../src/providers');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('failing provider setup', function() {
    let monitor;
    setup(async function() {
      monitor = await helper.load('monitor');

      setSetupRetryInterval(100); // 100ms by default, to avoid providers retrying for too long

      // load cfg so that helper.load.cfg(..) works later
      await helper.load('cfg');

      // reset the 'providers' component after each test
      helper.load.remove('providers');
    });

    teardown(function() {
      // check for and flush the errors about the provider starting up
      assert(
        monitor.manager.messages.every(
          msg => msg.Type === 'monitor.error' && msg.Fields.message === 'setup failure'));
      monitor.manager.reset();
    });

    test('failed provider is not included in forAll, but has returns true', async function() {
      helper.load.cfg('providers.testing1.setupFailure', 1);
      const providers = await helper.load('providers');
      await providers.forAll(prov => assert.notEqual(prov.providerId, 'testing1'));
      assert(providers.has('testing1'));
    });

    test('failed provider is returned by get with `setupFailed` property', async function() {
      helper.load.cfg('providers.testing1.setupFailure', 1);
      const providers = await helper.load('providers');
      assert.deepEqual(providers.get('testing1'), { setupFailed: true });
    });

    test('provider is returned by get once it succeeds', async function() {
      setSetupRetryInterval(5); // very short, since we want this to recover quickly
      helper.load.cfg('providers.testing1.setupFailure', 2);
      const providers = await helper.load('providers');
      let loops = 0;
      while (loops < 100 && providers.get('testing1').setupFailed) {
        loops++;
        await testing.sleep(3);
      }
      assert(loops > 0);
      assert(!providers.get('testing1').setupFailed);
    });
  });
});
