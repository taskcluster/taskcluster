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
        workerNodeType: 'test-worker'
      },
      (yield subject.configure())
    );
  }));
});
