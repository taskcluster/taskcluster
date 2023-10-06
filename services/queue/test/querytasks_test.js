const debug = require('debug')('test:query');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  test('pendingTasks >= 1', async () => {
    const taskDef = {
      taskQueueId: 'no-provisioner-extended-extended/query-test-worker-extended-extended',
      schedulerId: 'my-scheduler',
      taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
      routes: [],
      retries: 5,
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('2 minutes'),
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
    };

    const taskId1 = slugid.v4();
    const taskId2 = slugid.v4();

    debug('### Create tasks');
    await Promise.all([
      helper.queue.createTask(taskId1, taskDef),
      helper.queue.createTask(taskId2, taskDef),
    ]);

    const r1 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended/query-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).is.greaterThan(1);

    // Creating same task twice should only result in single entry in pending task queue
    await helper.queue.createTask(taskId1, taskDef);

    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended/query-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).is.equals(r1.pendingTasks);
  });

  test('pendingTasks requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.pendingTasks(
        'no-provisioner-extended-extended/empty-test-worker-extended-extended',
      ), err => err.code === 'InsufficientScopes');
  });

  test('pendingTasks == 0', async () => {
    helper.scopes('queue:pending-count:no-provisioner-extended-extended/empty-test-worker-extended-extended');
    const r1 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended/empty-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).equals(0);

    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended/empty-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).equals(0);
  });
});
