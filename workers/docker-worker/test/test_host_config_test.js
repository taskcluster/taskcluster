suite('test host', function() {
  var co = require('co');
  var subject = require('../lib/host/test');
  var settings = require('./settings');

  setup(settings.cleanup);
  teardown(settings.cleanup);

  test('configure', co(function* () {
    settings.configure({ capacity: 2, billingCycleInterval: 3600 });
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
      (yield subject.configure())
    );
  }));
});
