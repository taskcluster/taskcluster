const debug = require('debug')('test:dependencies');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const assume = require('assume');
const helper = require('./helper');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = () => ({
    provisionerId: 'no-provisioner-extended-extendeda',
    workerType: 'test-worker-extended-extended',
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
  });

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  test('taskA <- taskB', testing.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-defined'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-defined',
      Fields: {taskId: taskIdA, v: 1},
      Severity: LEVELS.notice,
    });
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-pending'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-pending',
      Fields: {taskId: taskIdA, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    let r2 = await helper.queue.createTask(taskIdB, taskB);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-defined'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-defined',
      Fields: {taskId: taskIdB, v: 1},
      Severity: LEVELS.notice,
    });
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-pending'), undefined);
    helper.clearPulseMessages();
    monitor.manager.reset();

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
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-running'), {
      Logger: 'taskcluster.test.work-claimer',
      Type: 'task-running',
      Fields: {taskId: taskIdA, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-completed'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-completed',
      Fields: {taskId: taskIdA, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    // task B should become pending on next poll
    await testing.poll(
      async () => {
        helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
        assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-pending'), {
          Logger: 'taskcluster.test.dependency-tracker',
          Type: 'task-pending',
          Fields: {taskId: taskIdB, runId: 0, v: 1},
          Severity: LEVELS.notice,
        });
      },
      200, 250);
    helper.clearPulseMessages();
    monitor.manager.reset();

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdB);
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();

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

    await helper.stopPollingService();
  }, {mock}));

  test('taskA <- taskB, taskC, taskD, taskE', testing.runWithFakeTime(async () => {
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
    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA');
    await helper.queue.createTask(taskIdA, taskA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### listTaskDependents');
    let d1 = await helper.queue.listDependentTasks(taskIdA);
    assume(d1.taskId).equals(taskIdA);
    assume(d1.tasks).has.length(0);

    debug('### Create taskB, taskC, taskD, taskE');
    await helper.queue.createTask(taskIdB, taskB);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();
    await helper.queue.createTask(taskIdC, taskC);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdC);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();
    await helper.queue.createTask(taskIdD, taskD);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdD);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();
    await helper.queue.createTask(taskIdE, taskE);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdE);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();

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
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### Wait for taskB, taskC, taskD, taskE to be pending');
    await testing.poll(async () => {
      helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
      helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdC);
      helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdD);
      helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdE);
    }, 200, 250);

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

    await helper.stopPollingService();
  }, {mock}));

  test('taskA, taskB <- taskC && taskA <- taskD', testing.runWithFakeTime(async () => {
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
    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA, taskB, taskC');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();
    let r3 = await helper.queue.createTask(taskIdC, taskC);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdC);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();
    let r4 = await helper.queue.createTask(taskIdD, taskD);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdD);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('pending');
    assume(r3.status.state).equals('unscheduled');
    assume(r4.status.state).equals('unscheduled');

    debug('### Claim taskA and taskB');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();

    debug('### Resolve taskA');
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### Wait for taskD to be pending');
    await testing.poll(
      async () => helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdD),
      200, 250);
    helper.clearPulseMessages();

    debug('### Resolve taskB');
    await helper.queue.reportCompleted(taskIdB, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();

    debug('### Wait for taskC to be pending');
    await testing.poll(
      async () => helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdC),
      200, 250);
    helper.clearPulseMessages();

    await helper.stopPollingService();
  }, {mock}));

  test('taskA <- taskA (self-dependency)', testing.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    debug('### Create taskA');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    assume(r1.status.state).equals('unscheduled');
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertNoPulseMessage('task-pending'); // because of the self-dep
    helper.clearPulseMessages();

    debug('### scheduleTask');
    await helper.queue.scheduleTask(taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### claimTask');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
  }, {mock}));

  test('taskA, taskB <- taskB (self-dependency)', testing.runWithFakeTime(async () => {
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
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    // no pending for taskIdB because of the dep and the self-dep
    helper.assertNoPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();

    debug('### claimTask and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();
    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### Check B is still unscheduled');
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');
    helper.assertNoPulseMessage('task-pending'); // because of the self-dep
    helper.clearPulseMessages();
  }, {mock}));

  test('taskX <- taskA (missing dependency)', async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [slugid.v4()],
    }, taskDef());

    debug('### Create taskA');
    await helper.queue.createTask(taskIdA, taskA).then(
      () => assert(false, 'Expected an error!'),
      err => {
        if (err.code !== 'InputError') {
          throw err;
        }
      },
    );

    debug('### get task');
    await helper.queue.task(taskIdA).then(
      () => assert(false, 'Expected an error!'),
      err => {
        if (err.code !== 'ResourceNotFound') {
          throw err;
        }
      },
    );
  });

  test('taskA <- taskB (reportFailed)', testing.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    await helper.queue.reportFailed(taskIdA, 0);

    debug('### Wait and check that taskB is unscheduled');
    // wait long enough for the dependencyResolver to run (it's fake time anyway!)
    await new Promise(accept => setTimeout(accept, 2000));
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');

    await helper.stopPollingService();
  }, {mock}));

  test('taskA <- taskB (cancelTask)', testing.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, taskDef());

    // Start dependency-resolver
    await helper.startPollingService('dependency-resolver');

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

    await helper.stopPollingService();
  }, {mock}));

  test('taskA <- taskB (reportFailed w. all-resolved)', testing.runWithFakeTime(async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
      requires: 'all-resolved',
    }, taskDef());

    // Start dependency-resolver
    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA); // 0NrmWy6kQKClb1gUuFndBw
    // put into taskgroups
    // put into taskgroupmembers
    // put into tsakgroupactivesets
    // put into deadline queue
    // put into Tasks
    // put into taskrequirements
    // put into taskdependency
    let r2 = await helper.queue.createTask(taskIdB, taskB); // JdDSGUoaSvediUtA_U8zAQ
    // same
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    helper.assertNoPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
    helper.clearPulseMessages();

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    // post to claim queue
    // update Tasks
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    await helper.queue.reportFailed(taskIdA, 0);
    // update Tasks
    // post to resolved
    helper.assertPulseMessage('task-failed', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    // last log from iterate is "running handler"
    debug('### Wait for taskB to be pending');
    await testing.poll(
      async () => helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB),
      200, 250);
    helper.clearPulseMessages();

    await helper.stopPollingService();
  }, {mock}));

  test('expiration of relationships', testing.runWithFakeTime(async () => {
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
      expires: taskcluster.fromNowJSON('30 days'),
    }, taskDef());

    debug('### Create tasks');
    const r1 = await helper.queue.createTask(taskIdA, taskA);
    const r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('unscheduled');
    assume(r2.status.state).equals('unscheduled');
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdA);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    helper.assertNoPulseMessage('task-pending');
    helper.clearPulseMessages();

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
  }, {mock}));
});
