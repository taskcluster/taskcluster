const assert = require('assert');
const waitForEvent = require('../../src/lib/wait_for_event');
const settings = require('../settings');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  let worker;
  setup(async () => {
    if (skipping()) {
      return;
    }
    settings.cleanup();
    settings.configure({
      shutdown: {
        enabled: true,
        afterIdleSeconds: 5,
      },
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
    let res = await Promise.all([
      worker.launch(),
      waitForEvent(worker, 'worker idle'),
      waitForEvent(worker, 'exit'),
    ]);
    assert.equal(res[1].afterIdleSeconds, 5);
  });

  test('with timer shutdown', async () => {
    await [worker.launch(), waitForEvent(worker, 'worker idle')];

    let res = await Promise.all([
      worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false,
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "Okay, this is now done"',
          ),
          maxRunTime: 60 * 60,
        },
      }),
      waitForEvent(worker, 'task resolved'),
      waitForEvent(worker, 'worker idle'),
      waitForEvent(worker, 'exit'),
    ]);
    // Ensure task completed.
    assert.equal(res[1].taskState, 'completed');
    assert.equal(res[2].afterIdleSeconds, 5);
  });

  test('cancel idle', async () => {
    await Promise.all([
      worker.launch(),
      waitForEvent(worker, 'worker idle'),
    ]);

    // Posting work should untrigger the shutdown timer and process the task.
    let events = await Promise.all([
      worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false,
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            'echo "Okay, this is now done"',
          ),
          maxRunTime: 60 * 60,
        },
      }),
      waitForEvent(worker, 'worker working'),
      waitForEvent(worker, 'task resolved'),
      waitForEvent(worker, 'worker idle'),
    ]);

    assert.ok(events[1], 'cancel event fired');
    assert.equal(events[2].taskState, 'completed');
  });
});
