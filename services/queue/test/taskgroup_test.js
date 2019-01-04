const debug = require('debug')('test:taskGroup');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
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

    debug('### Creating taskA');
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({taskGroupId}, taskDef));

    debug('### Listening for task-defined for taskA');
    helper.checkNextMessage('task-defined', message => assert(message.payload.status.taskId === taskIdA));
    helper.checkNextMessage('task-pending', message => assert(message.payload.status.taskId === taskIdA));

    debug('### Creating taskB');
    let taskIdB = slugid.v4();
    await helper.queue.createTask(taskIdB, _.defaults({taskGroupId}, taskDef));
    helper.checkNextMessage('task-defined', message => assert(message.payload.status.taskId === taskIdB));
    helper.checkNextMessage('task-pending', message => assert(message.payload.status.taskId === taskIdB));

    // Check taskA status (still pending)
    const r2 = await helper.queue.status(taskIdA);
    assume(r1.status).deep.equals(r2.status);

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', message => message.payload.status.taskId === taskIdA);
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.checkNextMessage('task-completed', message => message.payload.status.taskId === taskIdA);

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', message => message.payload.status.taskId === taskIdB);
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.checkNextMessage('task-completed', message => message.payload.status.taskId === taskIdB);

    // dependencies are resolved by an out-of-band process, so wait for it to complete
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    await testing.poll(async () => {
      // When using real queues, we may get results from dependency resolution
      // of other tests' tasks here, so we look specifically for the message we
      // want to find and ignore the rest.
      helper.messages.some(message => {
        if (message.exchange.endsWith('task-group-resolved') &&
          message.payload.taskGroupId === taskGroupId &&
          message.payload.schedulerId === 'dummy-scheduler') {
          return true;
        }
        return false;
      });
    }, Infinity);
    // note that depending on timing we are likely to get two such
    // messages; that's OK

    await dependencyResolver.terminate();
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
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
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
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
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
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
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
      schedulerId: 'dummy-scheduler-2',
    }, taskDef));
  });

  test('task-group expiration (doesn\'t drop table)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      expires: taskcluster.fromNowJSON('10 days'),
    }, taskDef));

    debug('### Expire task-groups');
    await helper.runExpiration('expire-task-groups');

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
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);

    debug('### Expire task-group memberships');
    await helper.runExpiration('expire-task-group-members');

    result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 0);
    assert(result.taskGroupId === taskGroupId);
  });

  test('task-group membership expiration (doesn\'t drop table)', async () => {
    let taskIdA = slugid.v4();
    let taskGroupId = slugid.v4();

    debug('### Creating taskA');
    const r1 = await helper.queue.createTask(taskIdA, _.defaults({
      taskGroupId,
      expires: taskcluster.fromNowJSON('10 days'),
    }, taskDef));

    let result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);

    debug('### Expire task-group memberships');
    await helper.runExpiration('expire-task-group-members');

    result = await helper.queue.listTaskGroup(taskGroupId);
    assert(!result.continuationToken);
    assert(members(result).length === 1);
    assert(_.includes(members(result), taskIdA));
    assert(result.taskGroupId === taskGroupId);
  });
});
