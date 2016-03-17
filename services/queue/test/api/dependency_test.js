suite('task.dependencies', function() {
  var debug       = require('debug')('test:dependencies');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    }
  };

  test('taskA <- taskB', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Listen for taskB pending');
    await helper.events.listenFor(
      'b-pending', helper.queueEvents.taskPending({taskId: taskIdB}),
    );
    let allowPendingNow = false;
    let taskBPending = helper.events.waitFor('b-pending').then(m => {
      assert(allowPendingNow, "Pending at wrong time");
      return m;
    });

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    allowPendingNow = true; // Allow taskB to becoming pending
    await helper.queue.reportCompleted(taskIdA, 0);

    debug('### Wait for taskB to be pending');
    await taskBPending;

    debug('### Claim and resolve taskB');
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportCompleted(taskIdB, 0);
  });

  test('taskA <- taskB, taskC, taskD, taskE', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskIdC = slugid.v4();
    let taskIdD = slugid.v4();
    let taskIdE = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));
    let taskC = _.cloneDeep(taskB);
    let taskD = _.cloneDeep(taskB);
    let taskE = _.cloneDeep(taskB);

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Listen for taskB pending');
    await Promise.all([
      helper.events.listenFor(
        'b-pending', helper.queueEvents.taskPending({taskId: taskIdB})
      ),
      helper.events.listenFor(
        'c-pending', helper.queueEvents.taskPending({taskId: taskIdC}),
      ),
      helper.events.listenFor(
        'd-pending', helper.queueEvents.taskPending({taskId: taskIdD}),
      ),
      helper.events.listenFor(
        'e-pending', helper.queueEvents.taskPending({taskId: taskIdE}),
      ),
    ]);

    debug('### Create taskA, taskB, taskC, taskD, taskE');
    await helper.queue.createTask(taskIdA, taskA);
    await helper.queue.createTask(taskIdB, taskB);
    await helper.queue.createTask(taskIdC, taskC);
    await helper.queue.createTask(taskIdD, taskD);
    await helper.queue.createTask(taskIdE, taskE);

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportCompleted(taskIdA, 0);

    debug('### Wait for taskB, taskC, taskD, taskE to be pending');
    await Promise.all([
      helper.events.waitFor('b-pending'),
      helper.events.waitFor('c-pending'),
      helper.events.waitFor('d-pending'),
      helper.events.waitFor('e-pending'),
    ]);
  });

  test('taskA, taskB <- taskC && taskA <- taskD', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();
    let taskIdC = slugid.v4();
    let taskIdD = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.cloneDeep(taskDef);
    let taskC = _.defaults({
      dependencies: [taskIdA, taskIdB],
    }, _.cloneDeep(taskDef));
    let taskD = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Listen for taskC pending');
    await helper.events.listenFor(
      'c-pending', helper.queueEvents.taskPending({taskId: taskIdC}),
    );
    let allowPendingNow = false;
    let taskCPending = helper.events.waitFor('c-pending').then(m => {
      assert(allowPendingNow, "Pending at wrong time");
      return m;
    });
    await helper.events.listenFor(
      'd-pending', helper.queueEvents.taskPending({taskId: taskIdD}),
    );

    debug('### Create taskA, taskB, taskC');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    let r3 = await helper.queue.createTask(taskIdC, taskC);
    let r4 = await helper.queue.createTask(taskIdD, taskD);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('pending');
    assume(r3.status.state).equals('unscheduled');
    assume(r4.status.state).equals('unscheduled');

    debug('### Claim taskA and taskB');
    await Promise.all([taskIdA, taskIdB].map(async (taskId) => {
      await helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }));
    debug('### Resolve taskA');
    await helper.queue.reportCompleted(taskIdA, 0);

    debug('### Wait for taskD');
    await helper.events.waitFor('d-pending');

    debug('### Resolve taskB');
    allowPendingNow = true; // Allow taskC to becoming pending
    await helper.queue.reportCompleted(taskIdB, 0);

    debug('### Wait for taskC to be pending');
    await taskCPending;
  });


  test('taskA <- taskA (self-dependency)', async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));

    debug('### Create taskA');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    assume(r1.status.state).equals('unscheduled');

    debug('### sceduleTask');
    await helper.queue.scheduleTask(taskIdA);

    debug('### claimTask');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
  });

  test('taskA, taskB <- taskB (self-dependency)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA, taskIdB],
    }, _.cloneDeep(taskDef));

    debug('### Create taskA, taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### claimTask and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportCompleted(taskIdA, 0);

    debug('### Check B is still unscheduled');
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');
  });

  test('taskX <- taskA (missing dependency)', async () => {
    let taskIdA = slugid.v4();
    let taskA = _.defaults({
      dependencies: [slugid.v4()],
    }, _.cloneDeep(taskDef));

    debug('### Create taskA');
    await helper.queue.createTask(taskIdA, taskA).then(
      ()  => assert(false, 'Expected an error!'),
      err => assert(err.code == 'InputError', 'Expected InputError')
    );

    debug('### get task');
    await helper.queue.task(taskIdA).then(
      ()  => assert(false, 'Expected an error!'),
      err => assert(err.code == 'ResourceNotFound', 'Expected ResourceNotFound')
    );
  });


  test('taskA <- taskB (reportFailed)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportFailed(taskIdA, 0);

    debug('### Wait and check that taskB is unscheduled');
    await new Promise(accept => setTimeout(accept, 1000));
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');
  });


  test('taskA <- taskB (cancelTask)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA],
    }, _.cloneDeep(taskDef));

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### cancelTask taskA');
    await helper.queue.cancelTask(taskIdA);

    debug('### Wait and check that taskB is unscheduled');
    await new Promise(accept => setTimeout(accept, 1000));
    let r3 = await helper.queue.status(taskIdB);
    assume(r3.status.state).equals('unscheduled');
  });

  test('taskA <- taskB (reportFailed w. all-resolved)', async () => {
    let taskIdA = slugid.v4();
    let taskIdB = slugid.v4();

    let taskA = _.cloneDeep(taskDef);
    let taskB = _.defaults({
      dependencies: [taskIdA],
      requires:     'all-resolved',
    }, _.cloneDeep(taskDef));

    // Start dependency-resolver
    await helper.dependencyResolver();

    debug('### Listen for taskB pending');
    await helper.events.listenFor(
      'b-pending', helper.queueEvents.taskPending({taskId: taskIdB}),
    );
    let allowPendingNow = false;
    let taskBPending = helper.events.waitFor('b-pending').then(m => {
      assert(allowPendingNow, "Pending at wrong time");
      return m;
    });

    debug('### Create taskA and taskB');
    let r1 = await helper.queue.createTask(taskIdA, taskA);
    let r2 = await helper.queue.createTask(taskIdB, taskB);
    assume(r1.status.state).equals('pending');
    assume(r2.status.state).equals('unscheduled');

    debug('### Claim and resolve taskA');
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    allowPendingNow = true; // Allow taskB to becoming pending
    await helper.queue.reportFailed(taskIdA, 0);

    debug('### Wait for taskB to be pending');
    await taskBPending;
  });
});
