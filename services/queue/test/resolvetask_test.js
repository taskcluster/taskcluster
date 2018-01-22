suite('Resolve task', function() {
  var debug       = require('debug')('test:completed');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          1,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose:        'taskcluster-testing',
    },
  };

  test('reportCompleted is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToCompleteNow = false;

    await helper.events.listenFor(
      'completed', helper.queueEvents.taskCompleted({taskId})
    );
    var gotMessage = helper.events.waitFor('completed').then((message) => {
      assert(allowedToCompleteNow, 'Completing at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task completed');
    allowedToCompleteNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportCompleted(taskId, 0);

    var m1 = await gotMessage;
    assume(m1.payload.status.runs[0].state).equals('completed');

    debug('### Reporting task completed (again)');
    await helper.queue.reportCompleted(taskId, 0);

    debug('### Reporting task completed (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportCompleted(taskId, 0);
  });

  test('reportFailed is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    await helper.events.listenFor('failed', helper.queueEvents.taskFailed({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('failed').then((message) => {
      assert(allowedToFailNow, 'Failed at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task failed');
    allowedToFailNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportFailed(taskId, 0);

    var m1 = await gotMessage;
    assume(m1.payload.status.runs[0].state).equals('failed');

    debug('### Reporting task failed (again)');
    await helper.queue.reportFailed(taskId, 0);

    debug('### Reporting task failed (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportFailed(taskId, 0);
  });

  test('reportException (malformed-payload) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToFailNow, 'Failed at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    allowedToFailNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });

    var {payload: {status: s1}} = await gotMessage;
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });

    debug('### Check status of task');
    var {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });
  });

  test('reportException (resource-unavailable) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToFailNow, 'Failed at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    allowedToFailNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });

    var {payload: {status: s1}} = await gotMessage;
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('resource-unavailable');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });

    debug('### Check status of task');
    var {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('resource-unavailable');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });
  });

  test('reportException (internal-error) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToFailNow, 'Failed at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    allowedToFailNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });

    var {payload: {status: s1}} = await gotMessage;
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('internal-error');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });

    debug('### Check status of task');
    var {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('internal-error');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });
  });

  test('reportException (superseded) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToFailNow, 'Failed at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    allowedToFailNow = true;
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'superseded',
    });

    var {payload: {status: s1}} = await gotMessage;
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('superseded');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'superseded',
    });

    debug('### Check status of task');
    var {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('superseded');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'superseded',
    });
  });

  test('reportException can\'t overwrite reason', async () => {
    var taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception (malformed-payload)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });

    debug('### Check status of task');
    var {status: s1} = await helper.queue.status(taskId);
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (internal-error)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
    }).then(() => {
      assert(false, 'Expected error');
    }, err => {
      assert(err.statusCode === 409, 'Expected conflict error');
    });

    debug('### Check status of task (again)');
    var {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('malformed-payload');
  });

  test('reportException (worker-shutdown) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToBeException = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToBeException, 'Exception at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.events.listenFor('pending', helper.queueEvents.taskPending({
      taskId,
    }));

    debug('### Reporting task exception (worker-shutdown)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    var r1 = await helper.queue.reportException(taskId, 0, {
      reason:     'worker-shutdown',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[1].state).equals('pending');
    await helper.queue.reportException(taskId, 0, {
      reason:     'worker-shutdown',
    });

    var m1 = await helper.events.waitFor('pending');
    assume(m1.payload.status).deep.equals(r1.status);
    assume(m1.payload.runId).equals(1);
    assume(m1.payload.status.runs[0].reasonResolved).equals('worker-shutdown');
    assume(m1.payload.status.runs[1].reasonCreated).equals('retry');

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception (again)');
    allowedToBeException = true;
    await helper.queue.reportException(taskId, 1, {
      reason:     'worker-shutdown',
    });

    var m1 = await gotMessage;
    assume(m1.payload.status.runs[1].state).equals('exception');
    assume(m1.payload.status.runs.length).equals(2);
  });

  test('reportComplete with bad scopes', async () => {
    var taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task completed');
    helper.scopes(
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportCompleted(taskId, 0).then(function() {
      throw new Error('Expected authentication error');
    }, function(err) {
      debug('Got expected authentication error: %s', err);
    });
  });

  test('reportException (intermittent-task) is idempotent', async () => {
    var taskId = slugid.v4();
    var allowedToBeException = false;
    var gotMessage = null;

    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId,
    }));

    var gotMessage = helper.events.waitFor('except').then((message) => {
      assert(allowedToBeException, 'Exception at wrong time');
      return message;
    });

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.events.listenFor('pending', helper.queueEvents.taskPending({
      taskId,
    }));

    debug('### Reporting task exception (intermittent-task)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    var r1 = await helper.queue.reportException(taskId, 0, {
      reason:     'intermittent-task',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[1].state).equals('pending');
    await helper.queue.reportException(taskId, 0, {
      reason:     'intermittent-task',
    });

    var m1 = await helper.events.waitFor('pending');
    assume(m1.payload.status).deep.equals(r1.status);
    assume(m1.payload.runId).equals(1);
    assume(m1.payload.status.runs[0].reasonResolved).equals('intermittent-task');
    assume(m1.payload.status.runs[1].reasonCreated).equals('task-retry');

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception (again)');
    allowedToBeException = true;
    await helper.queue.reportException(taskId, 1, {
      reason:     'intermittent-task',
    });

    var m1 = await gotMessage;
    assume(m1.payload.status.runs[1].state).equals('exception');
    assume(m1.payload.status.runs.length).equals(2);
  });
});
