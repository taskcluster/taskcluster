import debugFactory from 'debug';
const debug = debugFactory('test:query');
import assert from 'assert';
import slugid from 'slugid';
import taskcluster from 'taskcluster-client';
import assume from 'assume';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = {
    taskQueueId: 'no-provisioner-extended-extended/query-test-worker-extended-extended',
    schedulerId: 'my-scheduler',
    taskGroupId: slugid.v4(),
    routes: [],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('60 minutes'),
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

  test('pendingTasks params validation', async () => {
    await assert.rejects(
      () => helper.queue.pendingTasks(
        '1/1',
      ), err => err.code === 'InvalidRequestArguments');
  });

  test('pendingTasks >= 1', async () => {
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

    const c1 = await helper.queue.taskQueueCounts(
      'no-provisioner-extended-extended/query-test-worker-extended-extended',
    );
    assume(c1.pendingTasks).is.greaterThan(1);

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

  suite('listing pending tasks', () => {
    test('requires scope', async () => {
      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.listPendingTasks('some/queue'),
        err => err.code === 'InsufficientScopes',
      );

      helper.scopes('queue:pending-list:some/queue');
      const r1 = await helper.queue.listPendingTasks('some/queue');
      assume(r1.tasks).is.an('array');
    });

    test('should return nothing for unknown queue', async () => {
      const res = await helper.queue.listPendingTasks('unknown/queue');
      assume(res).is.an('object');
      assume(res.tasks).is.an('array');
      assume(res.tasks).has.length(0);
    });
    test('should return full task definitions', async () => {
      const taskId1 = slugid.v4();
      const taskId2 = slugid.v4();

      await helper.queue.createTask(taskId1, taskDef);
      await helper.queue.createTask(taskId2, taskDef);

      const res = await helper.queue.listPendingTasks(taskDef.taskQueueId);
      assume(res).is.an('object');
      assume(res.tasks).is.an('array');
      assume(res.tasks).has.length(2);
      // order should be preserved
      assume(res.tasks[0].taskId).equals(taskId1);
      assume(res.tasks[1].taskId).equals(taskId2);
      // records should have full task definition
      assume(res.tasks[0].task).is.an('object');
      assume(res.tasks[0].task.metadata).deep.equals(taskDef.metadata);
      assume(res.tasks[1].task).is.an('object');
      assume(res.tasks[1].task.metadata).deep.equals(taskDef.metadata);
      // insertion timestamps should be present and are in chronological order
      assume(res.tasks[0].inserted).is.a('string');
      assume(res.tasks[1].inserted).is.a('string');
      assume(new Date(res.tasks[0].inserted)).is.below(new Date(res.tasks[1].inserted));
    });
    test('pagination works', async () => {
      const taskIds = [];
      for (let i = 0; i < 10; i++) {
        taskIds.push(slugid.v4());
        await helper.queue.createTask(taskIds[i], taskDef);
      }

      const res1 = await helper.queue.listPendingTasks(taskDef.taskQueueId, { limit: 6 });
      assume(res1).is.an('object');
      assume(res1.tasks).is.an('array');
      assume(res1.tasks).has.length(6);
      assume(res1.continuationToken).is.a('string');

      const res2 = await helper.queue.listPendingTasks(taskDef.taskQueueId, {
        continuationToken: res1.continuationToken });
      assume(res2).is.an('object');
      assume(res2.tasks).is.an('array');
      assume(res2.tasks).has.length(4);
    });
  });

  suite('listing claimed tasks', () => {
    test('requires scope', async () => {
      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.listClaimedTasks('some/queue'),
        err => err.code === 'InsufficientScopes',
      );

      helper.scopes('queue:claimed-list:some/queue');
      const r1 = await helper.queue.listClaimedTasks('some/queue');
      assume(r1.tasks).is.an('array');
    });

    test('should return nothing for unknown queue', async () => {
      const res = await helper.queue.listPendingTasks('unknown/queue');
      assume(res).is.an('object');
      assume(res.tasks).is.an('array');
      assume(res.tasks).has.length(0);
    });
    test('should return task definition and worker info for claimed tasks', async () => {
      const taskId1 = slugid.v4();
      const taskId2 = slugid.v4();
      const workerGroup = 'my-worker-group';
      const workerId = 'my-worker-id';
      const runId = 0;

      await helper.queue.createTask(taskId1, taskDef);
      await helper.queue.createTask(taskId2, taskDef);
      await helper.queue.claimTask(taskId1, runId, { workerGroup, workerId });
      await helper.queue.claimTask(taskId2, runId, { workerGroup, workerId });

      const res = await helper.queue.listClaimedTasks(taskDef.taskQueueId);
      assume(res).is.an('object');
      assume(res.tasks).is.an('array');
      assume(res.tasks).has.length(2);
      // order should be preserved
      assume(res.tasks[0].taskId).equals(taskId1);
      assume(res.tasks[1].taskId).equals(taskId2);
      // records should have full task definition
      assume(res.tasks[0].task).is.an('object');
      assume(res.tasks[0].task.metadata).deep.equals(taskDef.metadata);
      // should return runId, workerGroup, workerId and claimed
      assume(res.tasks[0].runId).equals(runId);
      assume(res.tasks[0].workerGroup).equals(workerGroup);
      assume(res.tasks[0].workerId).equals(workerId);
      assume(res.tasks[0].claimed).is.a('string');
      // claimed should be in chronological order
      assume(res.tasks[1].claimed).is.a('string');
      assume(new Date(res.tasks[0].claimed)).is.below(new Date(res.tasks[1].claimed));
    });
  });

  test('taskQueueCounts', async () => {
    const taskId1 = slugid.v4();
    const taskId2 = slugid.v4();
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker-id';
    const taskQueueId = 'some/queue';
    const runId = 0;

    await helper.queue.createTask(taskId1, { ...taskDef, taskQueueId });
    await helper.queue.createTask(taskId2, { ...taskDef, taskQueueId });

    const r1 = await helper.queue.taskQueueCounts(taskQueueId);
    assume(r1.pendingTasks).equals(2);
    assume(r1.claimedTasks).equals(0);

    await helper.queue.claimTask(taskId1, runId, { workerGroup, workerId });
    const r2 = await helper.queue.taskQueueCounts(taskQueueId);
    assume(r2.pendingTasks).equals(1);
    assume(r2.claimedTasks).equals(1);

    await helper.queue.claimTask(taskId2, runId, { workerGroup, workerId });

    const r3 = await helper.queue.taskQueueCounts(taskQueueId);
    assume(r3.pendingTasks).equals(0);
    assume(r3.claimedTasks).equals(2);
  });

  test('pagination works', async () => {
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker-id';

    for (let i = 0; i < 10; i++) {
      const taskId = slugid.v4();
      await helper.queue.createTask(taskId, taskDef);
      await helper.queue.claimTask(taskId, 0, { workerGroup, workerId });
    }

    const res1 = await helper.queue.listClaimedTasks(taskDef.taskQueueId, { limit: 6 });
    assume(res1).is.an('object');
    assume(res1.tasks).is.an('array');
    assume(res1.tasks).has.length(6);
    assume(res1.continuationToken).is.a('string');

    const res2 = await helper.queue.listClaimedTasks(taskDef.taskQueueId, {
      continuationToken: res1.continuationToken });
    assume(res2).is.an('object');
    assume(res2.tasks).is.an('array');
    assume(res2.tasks).has.length(4);
  });
});
