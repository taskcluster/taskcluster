suite('test host', function() {
  var co = require('co');
  var subject = require('./test');
  var settings = require('../../test/settings');

  setup(settings.cleanup);
  teardown(settings.cleanup);

  test('billingCycleRemaining', co(function* () {
    settings.billingCycleRemaining(2000);
    assert.equal(2000, (yield subject.billingCycleRemaining()));
  }));

  test('configure', co(function* () {
    settings.configure({ capacity: 2 });
    assert.deepEqual({ capacity: 2 }, (yield subject.configure()));
  }));
});
