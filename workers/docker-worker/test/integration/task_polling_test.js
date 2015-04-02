import waitForEvent from '../../lib/wait_for_event';
import settings from '../settings';
import cmd from './helper/cmd';
import slugid from 'slugid';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';

suite('Task Polling', () => {

  // Ensure we don't leave behind our test configurations.
  teardown(async () => {
    if (worker) {
      await worker.terminate();
      worker = null
    }
    settings.cleanup();
  });

  let worker;

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

  test('poll for tasks beyond Azure queue limit', async () => {
    const QUEUE_LIMIT = 32;
    const CAPACITY = QUEUE_LIMIT + 4;

    settings.configure({
      capacity: CAPACITY,
      capacityManagement: {
        diskspaceThreshold: 1
      }
    });

    worker = new TestWorker(DockerWorker);
    worker.setMaxListeners(CAPACITY);
    await worker.launch();

    let tasks = [];

    for (let i = 0; i < CAPACITY; i++) {
      tasks.push(worker.postToQueue({
        payload: {
          features: {
            localLiveLog: false
          },
          image: 'taskcluster/test-ubuntu',
          command: cmd(
            "ls"
          ),
          maxRunTime: 60 * 60
        }
      }));
    }

    let results = await Promise.all(tasks);

    assert.equal(results.length, CAPACITY, `all ${CAPACITY} tasks must have completed`);
    results.forEach((taskRes) => {
      assert.equal(taskRes.run.state, 'completed');
      assert.equal(taskRes.run.reasonResolved, 'completed');
    });
  });
});
