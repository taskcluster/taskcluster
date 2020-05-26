const assert = require('assert');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const settings = require('../settings');
const TestWorker = require('../testworker');
const waitForEvent = require('../../src/lib/wait_for_event');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('../helper');

let worker;
helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

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
        diskspaceThreshold: 50 * 50000000000,
      },
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
          'sleep 5',
        ),
        maxRunTime: 60 * 60,
      },
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
});
