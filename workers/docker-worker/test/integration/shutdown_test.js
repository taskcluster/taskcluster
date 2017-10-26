const assert = require('assert');
const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');

suite('Shutdown on idle', () => {
  var worker;
  setup(async () => {
    settings.cleanup();
    settings.billingCycleInterval(40);
    settings.configure({
      shutdown: {
        enabled: true,
        minimumCycleSeconds: 2 // always wait 2 seconds before shutdown...
      }
    });

    worker = new TestWorker(DockerWorker);
  });

  // Ensure we don't leave behind our test configurations.
  teardown(async () => {
    try {
      // If the worker did not setup, terminate() will throw an exception.  Ignore
      // for tests.
      await worker.terminate();
      settings.cleanup();
    } catch(e) {
      // If the worker did not setup, terminate() will throw an exception.  Ignore
      // for tests.
      settings.cleanup();
    }
  });

  test('shutdown without ever working a task', async () => {
    settings.billingCycleUptime(30);
    var res = await Promise.all([
      worker.launch(),
      waitForEvent(worker, 'pending shutdown'),
      waitForEvent(worker, 'exit')
    ]);
    assert.equal(res[1].time, 8);
  });

  test('with timer shutdown', async () => {
    await [worker.launch(), waitForEvent(worker, 'pending shutdown')];
    settings.billingCycleUptime(469);

    var res = await Promise.all([
      worker.postToQueue({
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
      waitForEvent(worker, 'pending shutdown'),
      waitForEvent(worker, 'exit')
    ]);
    assert.equal(res[1].time, 9);
  });

  test('in range of shutdown', async () => {
    // We are very close to end of the cycle so might as well wait for some more
    // work rather then shutting down...
    settings.billingCycleUptime(79);
    // 2 seconds prior to the next billing interval.
    var res = await Promise.all([
      worker.launch(),
      waitForEvent(worker, 'pending shutdown'),
    ]);
    assert.equal(res[1].time, 39);
  });

  test('cancel idle', async () => {
    settings.billingCycleUptime(20);
    await worker.launch();
    var idling = await Promise.all([
      worker.postToQueue({
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
      waitForEvent(worker, 'pending shutdown')
    ]);
    assert.equal(idling[1].time, 18);

    var working = await Promise.all([
      worker.postToQueue({
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
      waitForEvent(worker, 'cancel pending shutdown')
    ]);
    assert.ok(working[1], 'cancel event fired');
  });
});
