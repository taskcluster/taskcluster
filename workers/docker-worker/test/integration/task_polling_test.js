import waitForEvent from '../../lib/wait_for_event';
import settings from '../settings';
import cmd from './helper/cmd';
import slugid from 'slugid';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('Task Polling', () => {
  // Ensure we don't leave behind our test configurations.
  teardown(settings.cleanup);

  // Total of number of tasks to run...
  let PARALLEL_TOTAL = 2;
  let worker;

  teardown(async () => {
    await worker.terminate();
  });

  test('do not poll if diskspace threshold is reached', async () => {
    settings.configure({
      capacityManagement: {
        diskspaceThreshold: 50 * 1000000000
      }
    })
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

    let task = worker.postToQueue(taskTpl);

    await waitForEvent(worker, 'created task');
    let claimedTask = false;
    worker.on('claim task', () => claimTask = true);
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
