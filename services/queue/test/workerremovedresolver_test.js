import assert from 'assert';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import { LEVELS } from '@taskcluster/lib-monitor';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskQueueId = helper.makeTaskQueueId('no-provisioner-extended-extended');

  const makeTask = (retries) => {
    return {
      taskQueueId,
      priority: "normal",
      retries,
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('30 min'),
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    };
  };

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  test('workerRemoved resolves claimed task as worker-shutdown with retry', async () => {
    const taskId = slugid.v4();
    const task = makeTask(1);

    // create and claim a task
    await helper.queue.createTask(taskId, task);
    const r1 = await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });
    assert.equal(r1.tasks.length, 1);
    assert.equal(r1.tasks[0].status.taskId, taskId);

    monitor.manager.reset();

    // load the worker-removed-resolver which will start consuming
    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    // simulate a workerRemoved pulse message by calling the handler directly
    await resolver.handleWorkerRemoved({
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'my-worker-group-extended-extended',
        workerId: 'my-worker-extended-extended',
        capacity: 1,
        reason: 'terminateAfter time exceeded',
        timestamp: new Date().toISOString(),
      },
    });

    // verify task is resolved as exception/worker-shutdown
    const status = await helper.queue.status(taskId);
    assert.equal(status.status.runs[0].state, 'exception');
    assert.equal(status.status.runs[0].reasonResolved, 'worker-shutdown');

    // verify a retry run was created
    assert.equal(status.status.runs.length, 2);
    assert.equal(status.status.runs[1].state, 'pending');
    assert.equal(status.status.runs[1].reasonCreated, 'retry');

    // verify pulse messages were published
    helper.assertPulseMessage('task-exception', m =>
      m.payload.status.taskId === taskId && m.payload.runId === 0);
    helper.assertPulseMessage('task-pending', m =>
      m.payload.status.taskId === taskId && m.payload.runId === 1);

    // verify monitor log
    assert.deepEqual(
      monitor.manager.messages.find(({ Type }) => Type === 'task-resolved-by-worker-removed'),
      {
        Logger: 'taskcluster.test.worker-removed-resolver',
        Type: 'task-resolved-by-worker-removed',
        Fields: {
          taskId,
          runId: 0,
          workerPoolId: taskQueueId,
          workerGroup: 'my-worker-group-extended-extended',
          workerId: 'my-worker-extended-extended',
          reason: 'terminateAfter time exceeded',
          v: 1,
        },
        Severity: LEVELS.notice,
      },
    );

    await resolver.terminate();
  });

  test('workerRemoved with no retries left resolves as final exception', async () => {
    const taskId = slugid.v4();
    const task = makeTask(0);

    await helper.queue.createTask(taskId, task);
    const r1 = await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });
    assert.equal(r1.tasks.length, 1);

    monitor.manager.reset();

    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    await resolver.handleWorkerRemoved({
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'my-worker-group-extended-extended',
        workerId: 'my-worker-extended-extended',
        capacity: 1,
        reason: 'workerManager.removeWorker API call',
        timestamp: new Date().toISOString(),
      },
    });

    const status = await helper.queue.status(taskId);
    assert.equal(status.status.runs[0].state, 'exception');
    assert.equal(status.status.runs[0].reasonResolved, 'worker-shutdown');
    // no retry run created
    assert.equal(status.status.runs.length, 1);

    helper.assertPulseMessage('task-exception', m =>
      m.payload.status.taskId === taskId && m.payload.runId === 0);

    await resolver.terminate();
  });

  test('workerRemoved for already-resolved task is a no-op', async () => {
    const taskId = slugid.v4();
    const task = makeTask(1);

    await helper.queue.createTask(taskId, task);
    const r1 = await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });
    assert.equal(r1.tasks.length, 1);

    // resolve the task before the workerRemoved event
    await helper.queue.reportCompleted(taskId, 0);

    monitor.manager.reset();

    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    await resolver.handleWorkerRemoved({
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'my-worker-group-extended-extended',
        workerId: 'my-worker-extended-extended',
        capacity: 1,
        reason: 'terminateAfter time exceeded',
        timestamp: new Date().toISOString(),
      },
    });

    // task should still be completed, not changed
    const status = await helper.queue.status(taskId);
    assert.equal(status.status.runs[0].state, 'completed');
    assert.equal(status.status.runs.length, 1);

    await resolver.terminate();
  });

  test('workerRemoved with no claimed tasks is a no-op', async () => {
    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    // should not throw
    await resolver.handleWorkerRemoved({
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'nonexistent-group',
        workerId: 'nonexistent-worker',
        capacity: 1,
        reason: 'terminateAfter time exceeded',
        timestamp: new Date().toISOString(),
      },
    });

    await resolver.terminate();
  });
});
