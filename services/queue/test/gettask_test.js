const slugid = require('slugid');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
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

  const taskDef = {
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    projectId: 'my-project',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    dependencies: [],
    requires: 'all-completed',
    routes: [],
    priority: 'lowest',
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    expires: taskcluster.fromNowJSON('3 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose: 'taskcluster-testing',
    },
    extra: {},
  };

  let taskId;

  setup(async function() {
    taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef);
  });

  test('task(taskId) is correct', async () => {
    helper.scopes(`queue:get-task:${taskId}`);
    const taskDef2 = await helper.queue.task(taskId);
    assume(`${taskDef2.provisionerId}/${taskDef2.workerType}`).equals(taskDef.taskQueueId);
    delete taskDef2.provisionerId;
    delete taskDef2.workerType;
    assume(taskDef2).deep.equals(taskDef);
  });

  test('task(taskId) requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.task(taskId),
      err => err.code === 'InsufficientScopes');
  });

  test('status(taskId) requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.status(taskId),
      err => err.code === 'InsufficientScopes');

    helper.scopes(`queue:status:${taskId}`);
    await helper.queue.status(taskId); // doesn't fail..
  });

});
