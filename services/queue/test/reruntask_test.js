const debug = require('debug')('test:rerun');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    routes: [],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonasfj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose: 'taskcluster-testing',
    },
  };
  let taskId;

  setup(() => {
    taskId = slugid.v4();
  });

  const createTask = async taskDef => {
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined');
    if (!taskDef.dependencies) {
      helper.assertPulseMessage('task-pending', m => m.payload.runId === 0);
    }
  };

  const claimTask = async () => {
    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');
  };

  test('rerun a scheduled task', async () => {
    // create a self-dependent task, so it is in state 'scheduled'
    await createTask({ ...taskDef, dependencies: [taskId] });

    debug('### Requesting task rerun');
    helper.scopes('queue:rerun-task:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ/*');
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message repated for run 0');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 0);
  });

  test('rerun a pending task (does nothing - is idempotent)', async () => {
    await createTask(taskDef);

    debug('### Requesting task rerun');
    helper.scopes('queue:rerun-task:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ/*');
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message repated for run 0');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 0);
  });

  test('rerun a completed task (twice - is idempotent)', async () => {
    await createTask(taskDef);
    await claimTask();

    debug('### Reporting task completed');
    await helper.queue.reportCompleted(taskId, 0);
    helper.assertPulseMessage('task-completed');

    debug('### Requesting task rerun');
    helper.scopes('queue:rerun-task:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ/*');
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message again');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);

    debug('### Requesting task rerun (again - idempotent)');
    await helper.queue.rerunTask(taskId);
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);
  });

  test('rerun a failed task', async () => {
    await createTask(taskDef);
    await claimTask();

    debug('### Reporting task completed');
    await helper.queue.reportFailed(taskId, 0);
    helper.assertPulseMessage('task-failed');

    debug('### Requesting task rerun');
    helper.scopes('queue:rerun-task:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ/*');
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message for run 1');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);
  });

  test('rerun an exception task', async () => {
    await createTask(taskDef);
    await claimTask();

    debug('### Reporting task completed');
    await helper.queue.reportException(taskId, 0, { reason: 'malformed-payload' });
    helper.assertPulseMessage('task-exception');

    debug('### Requesting task rerun');
    helper.scopes('queue:rerun-task:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ/*');
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message for run 1');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);
  });

  test('rerun with project scopes', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, {
      ...taskDef,
      projectId: 'testproj',
    });

    helper.scopes('queue:rerun-task-in-project:testproj');
    const r2 = await helper.queue.rerunTask(taskId);
    assert.equal(r2.status.state, 'pending');

    // fails with the wrong project scope
    helper.scopes('queue:rerun-task-in-project:WRONG-PROJECT');
    await assert.rejects(
      () => helper.queue.rerunTask(taskId),
      err => err.statusCode === 403);

    helper.clearPulseMessages();
  });

  test('throw error on missing task', async () => {
    const taskId = slugid.v4();
    await helper.queue.rerunTask(taskId).then(
      () => assert(0, 'expected an error'),
      err => {
        if (err.code !== 'ResourceNotFound') {
          throw err;
        }
      });
  });
});
