suite('Aliveness check', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  var worker;
  setup(co(function * () {
    settings.configure({
      alivenessCheckInterval: 200, // 200ms
    });

    worker = new TestWorker(DockerWorker);
  }));

  test('Aliveness check pings', co(function *() {
    // So we don't immediately shutdown.
    yield worker.launch();

    var checks = 20;

    var now = Date.now();
    while (checks-- > 0) {
      yield waitForEvent(worker, 'aliveness check');
    }
    var end = Date.now();
    assert.ok(end - now > 2000, 'aliveness check ran over 2s');
  }));
});

