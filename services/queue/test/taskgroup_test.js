const debug = require('debug')('test:taskGroup');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
    schedulerId: 'dummy-scheduler-extended-extended',
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('1 days'),
    expires: taskcluster.fromNowJSON('2 days'),
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
  };

  test('Create two tasks with same taskGroupId', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({ taskGroupId }, taskDef));

    debug('### Listening for task-defined for taskA');
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);

    debug('### Creating taskB');
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({ taskGroupId }, taskDef));
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);

    // Check taskA status (still pending)
    const r2 = helper.checkDates(await helper.queue.status(taskIdA));
    assume(r1.status).deep.equals(r2.status);

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdB);
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdB);

    // dependencies are resolved by an out-of-band process, so wait for it to complete
    await helper.startPollingService('dependency-resolver');

    await testing.poll(async () => {
      helper.assertPulseMessage('task-group-resolved', m => (
        m.payload.taskGroupId === taskGroupId &&
        m.payload.schedulerId === 'dummy-scheduler-extended-extended'));
      // note that depending on timing we are likely to get two such
      // messages; that's OK
    }, 100, 250);

    await helper.stopPollingService();
  });

  test('schedulerId is fixed per taskGroupId', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    helper.scopes(
      'queue:create-task:highest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:dummy-scheduler-extended-extended-*',
      'queue:create-task:project:none',
      'queue:task-group-id:*',
    );

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-extended-extended-1',
    }, taskDef));

    debug('### Creating taskB');
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-extended-extended-2',
    }, taskDef)).then(() => {assert(false, 'expected an error');}, err => {
      if (err.statusCode !== 409) {
        throw err;
      }
    });
  });

  let members = (result) => result.tasks.map(t => t.status.taskId);
  test('list task-group', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Creating taskB');
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    helper.scopes(`queue:list-task-group:${taskGroupId}`);

    debug('### listing');
    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(_.includes(members(result), taskIdA));
    assert(_.includes(members(result), taskIdB));
    assert(members(result).length === 2);
    assert(result.taskGroupId === taskGroupId);

    debug('### checking InsufficientScopes');
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.listTaskGroup(taskGroupId),
      err => err.code === 'InsufficientScopes');
  });

  test('list task-group (limit and continuationToken)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Creating taskB');
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId, {
      limit: 1,
    });
    assert(result.continuationToken);
    assert(_.includes(members(result), taskIdA) ||
           _.includes(members(result), taskIdB));
    assert(result.taskGroupId === taskGroupId);
    assert(members(result).length === 1);

    result = await helper.queue.listTaskGroup(taskGroupId, {
      limit: 1,
      continuationToken: result.continuationToken,
    });
    assert(!result.continuationToken);
    assert(_.includes(members(result), taskIdA) ||
           _.includes(members(result), taskIdB));
    assert(result.taskGroupId === taskGroupId);
    assert(members(result).length === 1);
  });

  test('list task-group -- doesn\'t exist', async () => {
    let taskGroupId = slugid.v4();
    await helper.queue.listTaskGroup(taskGroupId).then(
      () => assert(false, 'Expected and error'),
      err => assert(err.code === 'ResourceNotFound', 'err != ResourceNotFound'),
    );
  });

  test('task-group expiration', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Expire task-groups');
    await helper.runExpiration('expire-task-groups');

    debug('### Creating taskB');
    // This only works because we've expired the taskGroup definition, otherwise
    // we couldn't create a new task with same taskGroupId and different
    // schedulerId (this is tested in one of the cases above)
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-extended-extended-2',
    }, taskDef));
  });

  test('task-group expiration (doesn\'t drop table)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      expires: taskcluster.fromNowJSON('10 days'),
    }, taskDef));

    debug('### Expire task-groups');
    await helper.runExpiration('expire-task-groups');

    debug('### Creating taskB');
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-extended-extended-2',
    }, taskDef)).then(() => {assert(false, 'expected an error');}, err => {
      assert(err.statusCode === 409, 'Expected a 409 error');
    });
  });

  suite('get task group', function () {
    test('get task-group -- doesn\'t exist', async () => {
      let taskGroupId = slugid.v4();
      await helper.queue.getTaskGroup(taskGroupId).then(
        () => assert(false, 'Expected and error'),
        err => assert(err.code === 'ResourceNotFound', 'err != ResourceNotFound'),
      );
    });
    test('get existing task-group', async () => {
      let taskGroupId = slugid.v4();
      let taskIdA = slugid.v4();

      debug('### Creating taskA');
      await helper.queue.createTask(taskIdA, _.defaults({
        taskGroupId,
        schedulerId: 'sched-01',
      }, taskDef));

      const res = await helper.queue.getTaskGroup(taskGroupId);
      assert(res.taskGroupId === taskGroupId);
      assert(res.schedulerId === 'sched-01');
      assert(typeof res.sealed === 'undefined', 'Group should not be sealed yet');

      debug('### Sealing task-group');
      const res2 = await helper.queue.sealTaskGroup(taskGroupId);
      assert(res.expires, res2.expires);
      assert(typeof res2.sealed !== 'undefined');
    });
    test('checks permissions', async () => {
      let taskIdA = slugid.v4();
      let taskGroupId = slugid.v4();

      debug('### Creating taskA');
      await helper.queue.createTask(taskIdA, _.defaults({
        taskGroupId,
        projectId: 'prj1',
      }, taskDef));

      debug('### checking InsufficientScopes');
      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.getTaskGroup(taskGroupId),
        err => err.code === 'InsufficientScopes');
    });
  });

  suite('task group sealing', function () {
    test('sealing empty task group', async () => {
      let taskGroupId = slugid.v4();
      await helper.queue.sealTaskGroup(taskGroupId).then(() => {
        assert(false, 'expected an error');
      }, err => {
        assert(err.statusCode === 404, 'Expected a 404 error');
      });
    });

    test('sealing task group', async () => {
      let taskIdA = slugid.v4();
      let taskIdB = slugid.v4();
      let taskGroupId = slugid.v4();

      debug('### Creating taskA');
      await helper.queue.createTask(taskIdA, _.defaults({
        taskGroupId,
      }, taskDef));

      debug('### Seal task-group');
      const res = await helper.queue.sealTaskGroup(taskGroupId);

      assert(res.taskGroupId === taskGroupId);
      assert(res.sealed, 'Group not sealed');

      debug('### Creating taskB on a sealed group');
      await helper.queue.createTask(taskIdB, _.defaults({
        taskGroupId,
      }, taskDef)).then(() => { assert(false, 'expected an error'); }, err => {
        assert(err.statusCode === 409, 'Expected a 409 error');
      });
    });

    test('sealing permissions', async () => {
      let taskIdA = slugid.v4();
      let taskGroupId = slugid.v4();

      debug('### Creating taskA');
      await helper.queue.createTask(taskIdA, _.defaults({
        taskGroupId,
        projectId: 'prj1',
      }, taskDef));

      debug('### checking InsufficientScopes');
      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.sealTaskGroup(taskGroupId),
        err => err.code === 'InsufficientScopes');

      debug('### Seal task-group with seal scope');
      helper.scopes(`queue:seal-task-group:${taskGroupId}`);
      await helper.queue.sealTaskGroup(taskGroupId);
    });
  });
});
