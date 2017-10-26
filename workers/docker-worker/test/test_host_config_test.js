const assert = require('assert');
const subject = require('../src/lib/host/test');
const settings = require('./settings');

suite('test host', () => {
  setup(settings.cleanup);
  teardown(settings.cleanup);

  test('configure', async () => {
    settings.configure({capacity: 2, billingCycleInterval: 3600});
    assert.deepEqual(
      {
        capacity: 2,
        publicIp: '127.0.0.1',
        billingCycleInterval: 3600,
        workerNodeType: 'test-worker',
        instanceId: 'test-worker-instance',
        instanceType: 'r3-superlarge',
        privateIp: '169.254.1.1',
        region: 'us-middle-1a'
      },
      subject.configure()
    );
  });
});
