import assert from 'node:assert';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import { LEVELS } from '@taskcluster/lib-monitor';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(skipping);
  helper.withPulse(skipping);
  helper.withS3(mock, skipping);
  helper.withServer(skipping);
  helper.resetTables();

  const taskQueueId = helper.makeTaskQueueId('no-provisioner-extended-extended');

  const makeTask = retries => {
    return {
      taskQueueId,
      priority: 'lowest',
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
  suiteSetup(async () => {
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

    // verify claimed task record was cleaned up
    const db = await helper.load('db');
    const claimed = await db.fns.get_claimed_tasks_by_worker(
      taskQueueId,
      'my-worker-group-extended-extended',
      'my-worker-extended-extended'
    );
    assert.equal(claimed.length, 0);

    // verify pulse messages were published
    helper.assertPulseMessage('task-exception', m => m.payload.status.taskId === taskId && m.payload.runId === 0);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskId && m.payload.runId === 1);

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
      }
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

    // verify claimed task record was cleaned up
    const db = await helper.load('db');
    const claimed = await db.fns.get_claimed_tasks_by_worker(
      taskQueueId,
      'my-worker-group-extended-extended',
      'my-worker-extended-extended'
    );
    assert.equal(claimed.length, 0);

    helper.assertPulseMessage('task-exception', m => m.payload.status.taskId === taskId && m.payload.runId === 0);

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

  test('workerStopped resolves claimed task (no reason field)', async () => {
    const taskId = slugid.v4();
    const task = makeTask(1);

    await helper.queue.createTask(taskId, task);
    await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });

    monitor.manager.reset();

    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    // workerStopped messages have no reason field
    await resolver.handleWorkerRemoved({
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'my-worker-group-extended-extended',
        workerId: 'my-worker-extended-extended',
        capacity: 1,
        timestamp: new Date().toISOString(),
      },
    });

    const status = await helper.queue.status(taskId);
    assert.equal(status.status.runs[0].state, 'exception');
    assert.equal(status.status.runs[0].reasonResolved, 'worker-shutdown');
    assert.equal(status.status.runs.length, 2);
    assert.equal(status.status.runs[1].state, 'pending');

    // verify reason falls back to 'unknown' in the log
    const logMsg = monitor.manager.messages.find(({ Type }) => Type === 'task-resolved-by-worker-removed');
    assert.equal(logMsg.Fields.reason, 'unknown');

    await resolver.terminate();
  });

  test('receiving both workerStopped and workerRemoved is idempotent', async () => {
    const taskId = slugid.v4();
    const task = makeTask(1);

    await helper.queue.createTask(taskId, task);
    await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });

    monitor.manager.reset();

    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    const workerStoppedPayload = {
      payload: {
        workerPoolId: taskQueueId,
        providerId: 'test-provider',
        workerGroup: 'my-worker-group-extended-extended',
        workerId: 'my-worker-extended-extended',
        capacity: 1,
        timestamp: new Date().toISOString(),
      },
    };

    const workerRemovedPayload = {
      payload: {
        ...workerStoppedPayload.payload,
        reason: 'terminateAfter time exceeded',
      },
    };

    // first event resolves the task
    await resolver.handleWorkerRemoved(workerStoppedPayload);

    const status1 = await helper.queue.status(taskId);
    assert.equal(status1.status.runs[0].state, 'exception');
    assert.equal(status1.status.runs[0].reasonResolved, 'worker-shutdown');
    assert.equal(status1.status.runs.length, 2);
    helper.assertPulseMessage('task-exception');
    helper.clearPulseMessages();

    // second event should be a no-op (no errors, no duplicate runs, no pulse message)
    await resolver.handleWorkerRemoved(workerRemovedPayload);

    const status2 = await helper.queue.status(taskId);
    assert.equal(status2.status.runs[0].state, 'exception');
    assert.equal(status2.status.runs[0].reasonResolved, 'worker-shutdown');
    // still only 2 runs, not 3
    assert.equal(status2.status.runs.length, 2);
    helper.assertNoPulseMessage('task-exception');

    await resolver.terminate();
  });

  test('workerRemoved does not re-publish exception for a run already resolved by the worker', async () => {
    const taskId = slugid.v4();
    const task = makeTask(1);

    await helper.queue.createTask(taskId, task);
    await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 1,
    });

    // The worker itself reports worker-shutdown via the API (the happy path on
    // a preemption).
    await helper.queue.reportException(taskId, 0, { reason: 'worker-shutdown' });
    helper.assertPulseMessage('task-exception');
    helper.clearPulseMessages();

    const resolver = await helper.load('worker-removed-resolver');
    helper.load.remove('worker-removed-resolver');

    // worker-manager later reports the instance as removed.
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

    // The resolver must **not** re-publish a task-exception.
    helper.assertNoPulseMessage('task-exception');
    assert.equal(
      monitor.manager.messages.filter(({ Type }) => Type === 'task-resolved-by-worker-removed').length,
      0,
      'resolver should not claim to have resolved an already-resolved run'
    );

    // task should be unchanged. run 0 is exception/worker-shutdown, run 1 still pending.
    const status = await helper.queue.status(taskId);
    assert.equal(status.status.runs.length, 2);
    assert.equal(status.status.runs[0].reasonResolved, 'worker-shutdown');

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
