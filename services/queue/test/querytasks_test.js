const debug = require('debug')('test:query');
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
  helper.withQueueService(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  test('pendingTasks >= 1', async () => {
    const taskDef = {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'query-test-worker-extended-extended',
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
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).is.greaterThan(1);

    // Result is cached for 20 seconds, so adding one more and checking should
    // give the same result, as we're not waiting for the timeout
    await helper.queue.createTask(taskId1, taskDef);

    // Note: There is some timing here, but since the queue.pendingTasks result
    // is cached it ought to be really fast and take less than 20 seconds to
    // do: queue.createTask + queue.pendingTasks, if not that's also sort of a
    // bug we should investigate
    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'query-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).is.equals(r1.pendingTasks);
  });

  test('pendingTasks == 0', async () => {
    const r1 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'empty-test-worker-extended-extended',
    );
    assume(r1.pendingTasks).equals(0);

    const r2 = await helper.queue.pendingTasks(
      'no-provisioner-extended-extended',
      'empty-test-worker-extended-extended',
    );
    assume(r2.pendingTasks).equals(0);
  });
});
