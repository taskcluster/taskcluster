import debugFactory from 'debug';
const debug = debugFactory('test:schedule');
import assert from 'assert';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

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

  test('schedule with project scopes', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, {
      ...taskDef,
      projectId: 'testproj',
    });

    helper.scopes('queue:schedule-task-in-project:testproj');
    const r2 = await helper.queue.scheduleTask(taskId);
    assert.equal(r2.status.state, 'pending');

    // fails with the wrong project scope
    helper.scopes('queue:schedule-task-in-project:WRONG-PROJECT');
    await assert.rejects(
      () => helper.queue.scheduleTask(taskId),
      err => err.statusCode === 403);

    helper.clearPulseMessages();
  });

  test('throw error on missing task', async () => {
    const taskId = slugid.v4();
    await helper.queue.scheduleTask(taskId).then(
      () => assert(0, 'expected an error'),
      err => {
        if (err.code !== 'ResourceNotFound') {
          throw err;
        }
      });
  });
});
