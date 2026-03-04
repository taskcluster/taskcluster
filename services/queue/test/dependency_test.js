import debugFactory from 'debug';
const debug = debugFactory('test:dependencies');
import assert from 'assert';
import slugid from 'slugid';
import _ from 'lodash';
import taskcluster from '@taskcluster/client';
import testing from '@taskcluster/lib-testing';
import assume from 'assume';
import helper from './helper.js';
import { LEVELS } from '@taskcluster/lib-monitor';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = () => ({
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
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

  test('taskA <- taskB', async () => {
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
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-defined'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-defined',
      Fields: { taskId: taskIdA, v: 1 },
      Severity: LEVELS.notice,
    });
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-pending'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-pending',
      Fields: { taskId: taskIdA, runId: 0, v: 1 },
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    let r2 = await helper.queue.createTask(taskIdB, taskB);
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskIdB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-defined'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-defined',
      Fields: { taskId: taskIdB, v: 1 },
      Severity: LEVELS.notice,
    });
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-pending'), undefined);
    helper.clearPulseMessages();
    monitor.manager.reset();

    debug('### listTaskDependents');
    {
      helper.scopes(`queue:list-dependent-tasks:${taskIdA}`, `queue:list-dependent-tasks:${taskIdB}`);
      let d1 = await helper.queue.listDependentTasks(taskIdA);
      assume(d1.taskId).equals(taskIdA);
      assume(d1.tasks).has.length(1);
      assume(d1.tasks[0].status.taskId).equals(taskIdB);
      let d2 = await helper.queue.listDependentTasks(taskIdB);
      assume(d2.taskId).equals(taskIdB);
      assume(d2.tasks).has.length(0);

      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.listDependentTasks(taskIdA),
        err => err.code === 'InsufficientScopes');

      helper.scopes();
    }

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === taskIdA);
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-running'), {
      Logger: 'taskcluster.test.work-claimer',
      Type: 'task-running',
      Fields: { taskId: taskIdA, runId: 0, v: 1 },
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    await helper.queue.reportCompleted(taskIdA, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === taskIdA);
    assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-completed'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-completed',
      Fields: { taskId: taskIdA, runId: 0, v: 1 },
      Severity: LEVELS.notice,
    });
    helper.clearPulseMessages();
    monitor.manager.reset();

    // task B should become pending on next poll
    await testing.poll(
      async () => {
        helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdB);
        assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-pending'), {
          Logger: 'taskcluster.test.dependency-tracker',
          Type: 'task-pending',
          Fields: { taskId: taskIdB, runId: 0, v: 1 },
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
  });

  test('taskA <- taskB, taskC, taskD, taskE', async () => {
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
    let d3 = await helper.queue.listDependentTasks(taskIdA, { limit: 2 });
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
  });

  test('taskA, taskB <- taskC && taskA <- taskD', async () => {
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
  });

  test('taskA <- taskA (self-dependency)', async () => {
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
  });

  test('taskA, taskB <- taskB (self-dependency)', async () => {
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
    let r3 = helper.checkDates(await helper.queue.status(taskIdB));
    assume(r3.status.state).equals('unscheduled');
    helper.assertNoPulseMessage('task-pending'); // because of the self-dep
    helper.clearPulseMessages();
  });

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

  test('taskA <- taskB (reportFailed)', async () => {
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
    let r3 = helper.checkDates(await helper.queue.status(taskIdB));
    assume(r3.status.state).equals('unscheduled');

    await helper.stopPollingService();
  });

  test('taskA <- taskB (cancelTask)', async () => {
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
    let r3 = helper.checkDates(await helper.queue.status(taskIdB));
    assume(r3.status.state).equals('unscheduled');

    await helper.stopPollingService();
  });

  test('taskA <- taskB (reportFailed w. all-resolved)', async () => {
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
  });

  // https://github.com/taskcluster/taskcluster/issues/7829
  test('taskA <- taskB (all-completed) + taskC (all-resolved)', async () => {
    let taskIdA = slugid.v4();
    // Ensure taskIdB < taskIdC lexicographically so B is processed first.
    // The bug only happened if the all-completed task was processed first
    let taskIdB = 'A' + slugid.v4().slice(1);
    let taskIdC = 'B' + slugid.v4().slice(1);

    let taskA = taskDef();
    let taskB = _.defaults({
      dependencies: [taskIdA],
      requires: 'all-completed',
    }, taskDef());
    let taskC = _.defaults({
      dependencies: [taskIdA],
      requires: 'all-resolved',
    }, taskDef());

    await helper.startPollingService('dependency-resolver');

    debug('### Create taskA, taskB, and taskC');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    let r3 = await helper.queue.createTask(taskIdC, taskC);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');
    assume(r3.status.state).equals('unscheduled');
    helper.clearPulseMessages();

    debug('### Claim and fail taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    await helper.queue.reportFailed(taskIdA, 0);
    helper.assertPulseMessage('task-failed', m => m.payload.status.taskId === taskIdA);
    helper.clearPulseMessages();

    debug('### Wait for taskC (all-resolved) to be pending');
    await testing.poll(
      async () => helper.assertPulseMessage('task-pending', m => m.payload.status.taskId === taskIdC),
      200, 250);

    debug('### Verify taskB (all-completed) stays unscheduled');
    let statusB = helper.checkDates(await helper.queue.status(taskIdB));
    assume(statusB.status.state).equals('unscheduled');

    helper.clearPulseMessages();
    await helper.stopPollingService();
  });

  test('expiration of relationships', async () => {
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

    const db = await helper.load('db');

    debug('### Load dependencies to ensure they are present');
    assert.deepEqual(
      await db.fns.get_dependent_tasks(taskIdA, null, null, null, null),
      [{ dependent_task_id: taskIdA, requires: 'all-completed', satisfied: false }]);
    assert.deepEqual(
      await db.fns.get_dependent_tasks(taskIdB, null, null, null, null),
      [{ dependent_task_id: taskIdB, requires: 'all-completed', satisfied: false }]);

    debug('### expire task-dependency');
    await helper.runExpiration('expire-task-dependency');

    debug('### Load dependencies to ensure taskA is gone');
    assert.deepEqual(
      await db.fns.get_dependent_tasks(taskIdA, null, null, null, null),
      []);
    assert.deepEqual(
      await db.fns.get_dependent_tasks(taskIdB, null, null, null, null),
      [{ dependent_task_id: taskIdB, requires: 'all-completed', satisfied: false }]);
  });

  test('a task on which lots of other tasks depend is resolved', async () => {
    const reqTaskId = slugid.v4();
    const depTaskIds = _.range(200).map(() => slugid.v4());

    const t = await helper.queue.createTask(reqTaskId, taskDef());
    assert.equal(t.status.state, 'pending');
    await Promise.all(
      depTaskIds.map(
        async depTaskId => {
          const t = await helper.queue.createTask(depTaskId, { ...taskDef(), dependencies: [reqTaskId] });
          assert.equal(t.status.state, 'unscheduled');
        }));

    // Start dependency-resolver
    await helper.startPollingService('dependency-resolver');

    debug('### Claim reqTask');
    await helper.queue.claimTask(reqTaskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running', m => m.payload.status.taskId === reqTaskId);
    helper.clearPulseMessages();

    debug('### Resolve reqTask');
    await helper.queue.reportCompleted(reqTaskId, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.taskId === reqTaskId);
    helper.clearPulseMessages();

    // now verify that each of those tasks is pending
    const seen = new Set();
    await testing.poll(async () => {
      for (let [i, depTaskId] of depTaskIds.entries()) {
        if (seen.has(depTaskId)) {
          continue;
        }
        const status = helper.checkDates(await helper.queue.status(depTaskId));
        assert.equal(status.status.state, 'pending', `depTaskIds[${i}] = ${depTaskId} is not pending`);
        seen.add(depTaskId);
      }
    }, 40, 250);

    await helper.stopPollingService();
  });

  test('max task dependencies limits are observed', async () => {
    const MAX_DEPS = (await helper.load('cfg')).app.taskMaxDependencies;
    const TOO_MANY_DEPS = MAX_DEPS + 1;
    const reqTaskId = slugid.v4();
    const task = _.defaults({
      dependencies: _.range(TOO_MANY_DEPS).map(() => slugid.v4()),
    }, taskDef());

    await helper.queue.createTask(reqTaskId, task).then(
      () => assert(false, 'Expected an error!'),
      err => {
        if (err.code !== 'InputError') {
          throw err;
        }
      },
    );
  });
});
