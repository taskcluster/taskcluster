suite('Shutdown on idle', function() {
  var co = require('co');
  var waitForEvent = require('../../lib/wait_for_event');
  var settings = require('../settings');
  var cmd = require('./helper/cmd');

  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  var worker;
  setup(co(function * () {
    settings.cleanup();
    settings.billingCycleInterval(40);
    settings.configure({
      shutdown: {
        enabled: true,
        minimumCycleSeconds: 2 // always wait 2 seconds before shutdown...
      }
    });

    worker = new TestWorker(DockerWorker);
  }));

  // Ensure we don't leave behind our test configurations.
  teardown(co(function* () {
    yield worker.terminate();
    settings.cleanup();
  }));

  test('shutdown without ever working a task', co(function* () {
    settings.billingCycleUptime(30);
    var res = yield {
      start: worker.launch(),
      pendingShutdown: waitForEvent(worker, 'pending shutdown'),
      exit: waitForEvent(worker, 'exit')
    };
    assert.equal(res.pendingShutdown.time, 8);
  }));

  test('with timer shutdown', co(function *() {
    yield [worker.launch(), waitForEvent(worker, 'pending shutdown')];
    settings.billingCycleUptime(469);

    var res = yield {
      post: worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false,
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "Okay, this is now done"'
          ),
          maxRunTime: 60 * 60
        }
      }),
      pendingShutdown: waitForEvent(worker, 'pending shutdown'),
      exit: waitForEvent(worker, 'exit')
    };
    assert.equal(res.pendingShutdown.time, 9);
  }));

  test('in range of shutdown', co(function *() {
    // We are very close to end of the cycle so might as well wait for some more
    // work rather then shutting down...
    settings.billingCycleUptime(79);
    // 2 seconds prior to the next billing interval.
    var res = yield {
      start: worker.launch(),
      pendingShutdown: waitForEvent(worker, 'pending shutdown'),
    };
    assert.equal(res.pendingShutdown.time, 39);
  }));

  test('cancel idle', co(function *() {
    settings.billingCycleUptime(20);
    yield worker.launch();
    var idling = yield {
      post: worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false,
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "Okay, this is now done"'
          ),
          maxRunTime: 60 * 60
        }
      }),
      pendingShutdown: waitForEvent(worker, 'pending shutdown')
    };
    assert.equal(idling.pendingShutdown.time, 18);

    var working = yield {
      create: worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false,
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "Okay, this is now done"'
          ),
          maxRunTime: 60 * 60
        }
      }),
      canceled: waitForEvent(worker, 'cancel pending shutdown')
    };
    assert.ok(working.canceled, 'cancel event fired');
  }));
});
