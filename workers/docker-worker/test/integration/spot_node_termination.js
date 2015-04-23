import fs from 'fs';
import slugid from 'slugid';
import co from 'co';
import taskcluster from 'taskcluster-client';
import Docker from '../../lib/docker';
import dockerUtils from 'dockerode-process/utils';
import DockerWorker from '../dockerworker';
import TestWorker from '../testworker';
import * as settings from '../settings';
import getArtifact from './helper/get_artifact';
import sleep from '../../lib/util/sleep';
import waitForEvent from '../../lib/wait_for_event';

suite('Spot Node Termination', () => {
  let IMAGE = 'taskcluster/test-ubuntu:latest';
  let docker = Docker();
  let worker;

  setup(() => {
    // clean up any settings that may have been left behind
    settings.cleanup();

    settings.billingCycleInterval(40);
    settings.configure({
      shutdown: {
        enabled: true,
        nodeTerminationPoll: 1,
        minimumCycleSeconds: 2 // always wait 2 seconds before shutdown...
      }
    });
  });

  teardown(async () => {
    settings.cleanup();
    if (worker) {
      await worker.terminate();
      worker = undefined;
    }
  });

  test("abort running task", async () => {
    let task = {
      payload: {
        image: IMAGE,
        command: [
          '/bin/bash', '-c', 'echo "Hello"; sleep 15; echo "done";'
        ],
        maxRunTime: 60 * 60
      }
    };
    let taskId = slugid.v4();
    worker = new TestWorker(DockerWorker);
    worker.on('task run', () => { settings.nodeTermination(); });
    let launch = await worker.launch();
    let result = await worker.postToQueue(task, taskId);
    let taskStatus = await worker.queue.status(taskId);

    assert.equal(taskStatus.status.runs[0].state, 'exception',
      'First run should have been marked as exception on worker-shutdown'
    );

    assert.equal(taskStatus.status.runs[0].reasonResolved, 'worker-shutdown',
      'First run should be resolved with a reason of "worker-shutdown"'
    );

    let log = await getArtifact(
      { taskId: taskId, runId: 0 }, 'public/logs/live_backing.log'
    );

    assert.equal(log.indexOf('Artifact not found'), -1,
      'Backing log should have been created when task was aborted'
    );

    assert.notEqual(log.indexOf('Hello'), -1, 'Task should have started before being aborted.')
    assert.equal(log.indexOf('Done'), -1, 'Task should have been aborted before finishing')
    assert.notEqual(log.indexOf('Task has been aborted prematurely. Reason: worker-shutdown'), -1,
      'Log should indicate that task was aborted with a reason of "worker-shutdown"'
    );
  });

  test("abort task while pulling image", async () => {
    // Purposely using a large image that would take awhile to download.  Also,
    // this might need to be adjusted later to have a meaningful test.  If an
    // image is removed but the intermediate layers are used elsewhere, the image
    // is just untagged.  When pull image happens, the layers are there so there is
    // nothign to downloading causing the node termination notice to not happen
    // until after the task has started usually.
    let image = 'ubuntu:12.10'
    await dockerUtils.removeImageIfExists(docker, image);
    let task = {
      payload: {
        image: image,
        command: [
          '/bin/bash', '-c', 'echo "Hello"; sleep 15; echo "done";'
        ],
        maxRunTime: 60 * 60
      }
    };
    let taskId = slugid.v4();
    worker = new TestWorker(DockerWorker);
    worker.on('pull image', (msg) => {
      if (msg.image === image) { settings.nodeTermination(); }
    });
    let launch = await worker.launch();
    let result = await worker.postToQueue(task, taskId);
    let taskStatus = await worker.queue.status(taskId);

    assert.equal(taskStatus.status.runs[0].state, 'exception',
      'First run should have been marked as exception on worker-shutdown'
    );

    assert.equal(taskStatus.status.runs[0].reasonResolved, 'worker-shutdown',
      'First run should be resolved with a reason of "worker-shutdown"'
    );

    let log = await getArtifact(
      { taskId: taskId, runId: 0 }, 'public/logs/live_backing.log'
    );

    assert.equal(log.indexOf('Artifact not found'), -1,
      'Backing log should have been created when task was aborted'
    );

    assert.equal(log.indexOf('Hello'), -1, 'Task should not have started after being aborted.')
    assert.notEqual(log.indexOf('Task has been aborted prematurely. Reason: worker-shutdown'), -1,
      'Log should indicate that task was aborted with a reason of "worker-shutdown"'
    );
  });

  test('task is not claimed on startup if node terminated', async () => {
    settings.configure({
      taskQueue: {
        pollInterval: 500,
        expiration: 5 * 60 * 1000,
        maxRetries: 5,
        requestRetryInterval: 2 * 1000
      },
      shutdown: {
        enabled: true,
        nodeTerminationPoll: 2000,
        minimumCycleSeconds: 2 // always wait 2 seconds before shutdown...
      }
    });

    settings.nodeTermination();

    worker = new TestWorker(DockerWorker);
    await worker.launch();

    let claimedTask = false;
    worker.on('claim task', () => claimedTask = true);

    let taskDefinition = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash', '-c', 'echo "Hello"'
        ],
        maxRunTime: 60 * 60
      }
    };

    worker.postToQueue(taskDefinition);
    waitForEvent(worker, 'created task');

    // Wait enough time after task has been submitted and many task polling
    // intervals have occurred.
    // XXX: This makes a (bad) assumption that there are no
    // issues with the worker code to claim a task.
    await sleep(10000);

    assert.ok(!claimedTask, 'Task should not have been claimed');
  });
});

