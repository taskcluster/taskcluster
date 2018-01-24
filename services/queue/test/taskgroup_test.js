suite('TaskGroup features', () => {
  var debug       = require('debug')('test:taskGroup');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'dummy-scheduler',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('1 days'),
    expires:          taskcluster.fromNowJSON('2 days'),
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
  };

  test('Create two tasks with same taskGroupId', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    // Start dependency-resolver
    await helper.dependencyResolver();

    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskIdA,
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskIdA,
    }));
    await helper.events.listenFor('task-group-resolved', helper.queueEvents.taskGroupResolved({
      taskGroupId: taskGroupId,
    }));

    let shouldveResolved = false;
    let taskGroupResolvedHandler = helper.events.waitFor('task-group-resolved').then(message => {
      assert(shouldveResolved, 'Task group resolved too soon!');
      return message;
    });

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Creating taskB');
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Listening for task-defined for taskA');
    var m1 = await helper.events.waitFor('is-defined');
    assume(r1.status).deep.equals(m1.payload.status);

    // Wait for task-pending message for taskA
    var m2 = await helper.events.waitFor('is-pending');
    assume(m2.payload.status).deep.equals(m2.payload.status);

    // Check taskA status
    var r2 = await helper.queue.status(taskIdA);
    assume(r1.status).deep.equals(r2.status);

    // Check that task group finishes
    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    await helper.queue.reportCompleted(taskIdA, 0);

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    // Allow any message to arrive, so we're resonably sure
    // there isn't one on the wire
    await new Promise(resolve => setTimeout(resolve, 250));
    shouldveResolved = true;
    await helper.queue.reportCompleted(taskIdB, 0);

    let tgf = await taskGroupResolvedHandler;
    assume(tgf.payload.taskGroupId).equals(taskGroupId);
    assume(tgf.payload.schedulerId).equals('dummy-scheduler');
  });

  test('schedulerId is fixed per taskGroupId', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:task-group-id:*',
      'queue:schedule-task:*',
    );

    debug('### Creating taskA');
    await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-1',
    }, taskDef));

    debug('### Creating taskB');
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-2',
    }, taskDef)).then(() => {assert(false, 'expected an error');}, err => {
      assert(err.statusCode === 409, 'Expected a 409 error');
    });
  });

  let members = (result) => result.tasks.map(t => t.status.taskId);
  test('list task-group', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Creating taskB');
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(_.includes(members(result), taskIdA));
    assert(_.includes(members(result), taskIdB));
    assert(members(result).length === 2);
    assert(result.taskGroupId === taskGroupId);
  });

  test('list task-group (limit and continuationToken)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
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
      ()  => assert(false, 'Expected and error'),
      err => assert(err.code === 'ResourceNotFound', 'err != ResourceNotFound'),
    );
  });

  test('task-group expiration', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    debug('### Expire task-groups');
    await helper.expireTaskGroups();

    debug('### Creating taskB');
    // This only works because we've expired the taskGroup definition, otherwise
    // we couldn't create a new task with same taskGroupId and different
    // schedulerId (this is tested in one of the cases above)
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-2',
    }, taskDef));
  });

  test('task-group expiration (doesn\'t drop table)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      expires: taskcluster.fromNowJSON('10 days'),
    }, taskDef));

    debug('### Expire task-groups');
    await helper.expireTaskGroups();

    debug('### Creating taskB');
    await helper.queue.createTask(taskIdB, _.defaults({
      taskGroupId,
      schedulerId: 'dummy-scheduler-2',
    }, taskDef)).then(() => {assert(false, 'expected an error');}, err => {
      assert(err.statusCode === 409, 'Expected a 409 error');
    });
  });

  test('task-group membership expiration', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);

    debug('### Expire task-group memberships');
    await helper.expireTaskGroupMembers();

    result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 0);
    assert(result.taskGroupId === taskGroupId);
  });

  test('task-group membership expiration (doesn\'t drop table)', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    var r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      expires: taskcluster.fromNowJSON('10 days'),
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);

    debug('### Expire task-group memberships');
    await helper.expireTaskGroupMembers();

    result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);
  });
});
