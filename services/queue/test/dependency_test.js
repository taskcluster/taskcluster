const debug = require('debug')('test:dependencies');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const assume = require('assume');
const helper = require('./helper');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  const taskDef = () => ({
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
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
  });

  test('taskA <- taskB', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### listTaskDependents');
    {
      let d1 = await helper.queue.listDependentTasks(taskIdA);
      assume(d1.taskId).equals(taskIdA);
      assume(d1.tasks).has.length(1);
      assume(d1.tasks[0].status.taskId).equals(taskIdB);
      let d2 = await helper.queue.listDependentTasks(taskIdB);
      assume(d2.taskId).equals(taskIdB);
      assume(d2.tasks).has.length(0);
    }

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdA));
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdA));

    // task B should become pending on next poll
    await testing.poll(
      async () => helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdB)),
      Infinity);

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdB));
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdB));

    debug('### listTaskDependents');
    {
      let d1 = await helper.queue.listDependentTasks(taskIdA);
      assume(d1.taskId).equals(taskIdA);
      assume(d1.tasks).has.length(1);
      assume(d1.tasks[0].status.taskId).equals(taskIdB);
      let d2 = await helper.queue.listDependentTasks(taskIdB);
      assume(d2.taskId).equals(taskIdB);
      assume(d2.tasks).has.length(0);
    }

    await dependencyResolver.terminate();
  }, mock));

  test('taskA <- taskB, taskC, taskD, taskE', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskIdC = slugid.v4();
    let taskIdD = slugid.v4();
    let taskIdE = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());
    let taskC = _.cloneDeep(taskB);
    let taskD = _.cloneDeep(taskB);
    let taskE = _.cloneDeep(taskB);

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA');
    await helper.queue.createTask(taskIdA, taskA);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### listTaskDependents');
    let d1 = await helper.queue.listDependentTasks(taskIdA);
    assume(d1.taskId).equals(taskIdA);
    assume(d1.tasks).has.length(0);

    debug('### Create taskB, taskC, taskD, taskE');
    await helper.queue.createTask(taskIdB, taskB);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    helper.checkNoNextMessage('task-pending');
    await helper.queue.createTask(taskIdC, taskC);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdC));
    helper.checkNoNextMessage('task-pending');
    await helper.queue.createTask(taskIdD, taskD);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdD));
    helper.checkNoNextMessage('task-pending');
    await helper.queue.createTask(taskIdE, taskE);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdE));
    helper.checkNoNextMessage('task-pending');

    debug('### listTaskDependents');
    let d2 = await helper.queue.listDependentTasks(taskIdA);
    assume(d2.taskId).equals(taskIdA);
    assume(d2.tasks).has.length(4);
    assume(d2.tasks.map(t => t.status.taskId)).contains(taskIdB);
    assume(d2.tasks.map(t => t.status.taskId)).contains(taskIdC);
    assume(d2.tasks.map(t => t.status.taskId)).contains(taskIdD);
    assume(d2.tasks.map(t => t.status.taskId)).contains(taskIdE);

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdA));
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### Wait for taskB, taskC, taskD, taskE to be pending');
    await testing.poll(async () => assert(helper.messages.length >= 4), Infinity);
    const nowPending = new Set(helper.messages
      .filter(m => m.exchange.endsWith('task-pending'))
      .map(m => m.payload.status.taskId));
    assume(nowPending).to.deeply.equal(new Set([taskIdB, taskIdC, taskIdD, taskIdE]));

    debug('### listTaskDependents, limit = 2');
    let d3 = await helper.queue.listDependentTasks(taskIdA, {limit: 2});
    assume(d3.tasks).has.length(2);
    assume(d3).ownProperty('continuationToken');
    let d4 = await helper.queue.listDependentTasks(taskIdA, {
      limit: 2,
      continuationToken: d3.continuationToken,
    });
    assume(d4.tasks).has.length(2);
    assume(d4).not.has.ownProperty('continuationToken');
    let tids = _.flatten([d3.tasks, d4.tasks]).map(t => t.status.taskId);
    assume(tids).contains(taskIdB);
    assume(tids).contains(taskIdC);
    assume(tids).contains(taskIdD);
    assume(tids).contains(taskIdE);

    await dependencyResolver.terminate();
  }, mock));

  test('taskA, taskB <- taskC && taskA <- taskD', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskIdC = slugid.v4();
    let taskIdD = slugid.v4();

    let taskA = taskDef();
    let taskB = taskDef();
    let taskC = _.defaults({
      dependencies: [taskIdA, taskIdB],
    }, taskDef());
    let taskD = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA, taskB, taskC');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdB));
    let r3 = await helper.queue.createTask(taskIdC, taskC);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdC));
    helper.checkNoNextMessage('task-pending');
    let r4 = await helper.queue.createTask(taskIdD, taskD);
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdD));
    helper.checkNoNextMessage('task-pending');
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('pending');
    assume(r3.status.state).equals('unscheduled');
    assume(r4.status.state).equals('unscheduled');

    debug('### Claim taskA and taskB');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdA));
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdB));

    debug('### Resolve taskA');
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### Wait for taskD to be pending');
    await testing.poll(
      async () => helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdD)),
      Infinity);

    debug('### Resolve taskB');
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdB));

    debug('### Wait for taskC to be pending');
    await testing.poll(
      async () => helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdC)),
      Infinity);

    await dependencyResolver.terminate();
  }, mock));

  test('taskA <- taskA (self-dependency)', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    debug('### Create taskA');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    assume(r1.status.state).equals('unscheduled');
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNoNextMessage('task-pending'); // because of the self-dep

    debug('### scheduleTask');
    await helper.queue.scheduleTask(taskIdA);
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### claimTask');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
  }, mock));

  test('taskA, taskB <- taskB (self-dependency)', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA, taskIdB],
    }, taskDef());

    debug('### Create taskA, taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    helper.checkNoNextMessage('task-pending'); // because of the dep and the self-dep

    debug('### claimTask and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdA));
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.checkNextMessage('task-completed', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### Check B is still unscheduled');
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');
    helper.checkNoNextMessage('task-pending'); // because of the self-dep
  }, mock));

  test('taskX <- taskA (missing dependency)', async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [slugid.v4()],
    }, taskDef());

    debug('### Create taskA');
    await helper.queue.createTask(taskIdA, taskA).then(
      ()  => assert(false, 'Expected an error!'),
      err => {
        if (err.code !== 'InputError') {
          throw err;
        }
      },
    );

    debug('### get task');
    await helper.queue.task(taskIdA).then(
      ()  => assert(false, 'Expected an error!'),
      err => {
        if (err.code !== 'ResourceNotFound') {
          throw err;
        }
      },
    );
  });

  test('taskA <- taskB (reportFailed)', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    await helper.queue.reportFailed(taskIdA, 0);

    debug('### Wait and check that taskB is unscheduled');
    // wait long enough for the dependencyResolver to run (it's fake time anyway!)
    await new Promise(accept => setTimeout(accept, 2000));
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');

    await dependencyResolver.terminate();
  }, mock));

  test('taskA <- taskB (cancelTask)', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### cancelTask taskA');
    await helper.queue.cancelTask(taskIdA);

    debug('### Wait and check that taskB is unscheduled');
    // wait long enough for the dependencyResolver to run (it's fake time anyway!)
    await new Promise(accept => setTimeout(accept, 1000));
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');

    await dependencyResolver.terminate();
  }, mock));

  test('taskA <- taskB (reportFailed w. all-resolved)', helper.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
      requires:     'all-resolved',
    }, taskDef());

    // Start dependency-resolver
    const dependencyResolver = await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    helper.checkNoNextMessage('task-pending');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running', m => assert.equal(m.payload.status.taskId, taskIdA));
    await helper.queue.reportFailed(taskIdA, 0);
    helper.checkNextMessage('task-failed', m => assert.equal(m.payload.status.taskId, taskIdA));

    debug('### Wait for taskB to be pending');
    await testing.poll(
      async () => helper.checkNextMessage('task-pending', m => assert.equal(m.payload.status.taskId, taskIdB)),
      Infinity);

    await dependencyResolver.terminate();
  }, mock));

  test('expiration of relationships', helper.runWithFakeTime(async () => {
    const taskIdA = slugid.v4();
    const taskA = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // make an old task that doesn't expire to ensure the expiration doesn't
    // just drop the entire table..
    const taskIdB = slugid.v4();
    const taskB = _.defaults({
      dependencies: [taskIdB],
      // test config is set to expire 4 days early so we set expiration long
      expires:      taskcluster.fromNowJSON('30 days'),
    }, taskDef());

    debug('### Create tasks');
    const r1 = await helper.queue.createTask(taskIdA, taskA);
    const r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('unscheduled');
    assume(r2.status.state).equals('unscheduled');
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdA));
    helper.checkNextMessage('task-defined', m => assert.equal(m.payload.status.taskId, taskIdB));
    helper.checkNoNextMessage('task-pending');

    debug('### Get new data wrappers');
    const TaskDependency = helper.TaskDependency;
    const TaskRequirement = helper.TaskRequirement;

    debug('### Load relations to ensure they are present');
    const r3 = await TaskDependency.load({taskId: taskIdA, dependentTaskId: taskIdA}, true);
    const r4 = await TaskRequirement.load({taskId: taskIdA, requiredTaskId: taskIdA}, true);
    assert(r3, 'Expected TaskDependency');
    assert(r4, 'Expected TaskRequirement');

    debug('### expire task-requirement');
    await helper.runExpiration('expire-task-requirement');
    const r5 = await TaskDependency.load({taskId: taskIdA, dependentTaskId: taskIdA}, true);
    const r6 = await TaskRequirement.load({taskId: taskIdA, requiredTaskId: taskIdA}, true);
    assert(r5, 'Expected TaskDependency');
    assert(!r6, 'Did not expect TaskRequirement');

    debug('### expire task-dependency');
    await helper.runExpiration('expire-task-dependency');
    const r7 = await TaskDependency.load({taskId: taskIdA, dependentTaskId: taskIdA}, true);
    const r8 = await TaskRequirement.load({taskId: taskIdA, requiredTaskId: taskIdA}, true);
    assert(!r7, 'Did not expect TaskDependency');
    assert(!r8, 'Did not expect TaskRequirement');

    const r9 = await TaskDependency.load({taskId: taskIdB, dependentTaskId: taskIdB}, true);
    const r10 = await TaskRequirement.load({taskId: taskIdB, requiredTaskId: taskIdB}, true);
    assert(r9, 'Expected TaskDependency');
    assert(r10, 'Expected TaskRequirement');
  }, mock));

});
