const assert = require('assert');
const base = require('taskcluster-base');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const settings = require('../settings');
const TestWorker = require('../testworker');
const waitForEvent = require('../../src/lib/wait_for_event');

let worker;
suite('Task Polling', () => {
  // Ensure we don't leave behind our test configurations.
  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    settings.cleanup();
  });

  test('do not poll if diskspace threshold is reached', async () => {
    settings.configure({
      capacityManagement: {
        diskspaceThreshold: 50 * 50000000000
      }
    });

    worker = new TestWorker(DockerWorker);
    await worker.launch();

    let taskTpl = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          // Sleep is used to ensure that each worker will get one task
          // (assumption being that both workers are in a running state and can
          // fetch a task in under 5s + overhead)
          'sleep 5'
        ),
        maxRunTime: 60 * 60
      }
    };

    worker.postToQueue(taskTpl);

    await waitForEvent(worker, 'created task');
    let claimedTask = false;
    worker.on('claim task', () => claimedTask = true);
    let count = 0;
    // Wait for a few polling cycles and ensure a task hasn't been claimed and
    // proper alert has been logged
    while (++count <= 2) {
      // Wait for a few cycles of trying to poll for work and ensure message is logged
      await waitForEvent(worker, '[alert-operator] diskspace threshold reached');
    }

    assert.ok(!claimedTask, 'Task should not have been claimed');
  });

  test('task polling at normal speed', async () => {
    settings.billingCycleUptime(30);
    settings.billingCycleInterval(40);

    worker = new TestWorker(DockerWorker);
    await worker.launch();
    // wait for one polling cycle so that the next polling cycle with uptime
    // adjustment triggers a change that can be validated
    await waitForEvent(worker, 'polling');

    settings.billingCycleUptime(0);
    let pollingMessage = await waitForEvent(worker, 'polling');
    assert.equal(pollingMessage.message, 'polling interval adjusted');
    assert.ok(pollingMessage.oldInterval > pollingMessage.newInterval);
  });

  test('task polling slows down', async () => {
    settings.billingCycleUptime(0);
    settings.billingCycleInterval(40);
    worker = new TestWorker(DockerWorker);
    await worker.launch();
    //make sure the polling timer is accurate
    await base.testing.sleep(6000);

    settings.billingCycleUptime(30);

    let pollingMessage = await waitForEvent(worker, 'polling');
    assert.equal(pollingMessage.message, 'polling interval adjusted');
    assert.ok(pollingMessage.oldInterval < pollingMessage.newInterval);
  });
});
