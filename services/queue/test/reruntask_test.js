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
  helper.withQueueService(mock, skipping);
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

  test('create, claim, complete and rerun (is idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 0);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');

    debug('### Reporting task completed');
    await helper.queue.reportCompleted(taskId, 0);
    helper.assertPulseMessage('task-completed');

    debug('### Requesting task rerun');
    helper.scopes(
      'queue:rerun-task',
      'assume:scheduler-id:my-scheduler-extended-extended/dSlITZ4yQgmvxxAi4A8fHQ',
    );
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message again');
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);

    debug('### Requesting task rerun (again - idempotent)');
    await helper.queue.rerunTask(taskId);
    helper.assertPulseMessage('task-pending', m => m.payload.runId === 1);
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
