suite('Claim task', function() {
  var debug       = require('debug')('test:claim');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
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

  test('can claimTask', async () => {
    var taskId = slugid.v4();

    debug('### Start listening for task running message');
    await helper.events.listenFor('running', helper.queueEvents.taskRunning({
      taskId,
    }));

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claim task');
    // Reduce scopes available to test minimum set of scopes required
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    var before = new Date();
    var r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    var takenUntil = new Date(r1.takenUntil);
    // Compare to time before the request, because claimTimeout is very small
    // so we can only count on takenUntil being larger than or equal to the
    // time before the request was made
    assume(takenUntil.getTime()).is.greaterThan(before.getTime() - 1);

    // Check that task definition is included..
    assume(r1.task).deep.equals(await helper.queue.task(taskId));

    debug('### Waiting for task running message');
    var m1 = await helper.events.waitFor('running');
    assume(m1.payload.status).deep.equals(r1.status);

    debug('### Fetch task status');
    var r2 = await helper.queue.status(taskId);
    assume(r2.status).deep.equals(r1.status);

    debug('### reclaimTask');
    await base.testing.sleep(100);
    // Again we talking about the first run, so runId must still be 0
    var r3 = await helper.queue.reclaimTask(taskId, 0);
    var takenUntil2 = new Date(r3.takenUntil);
    assume(takenUntil2.getTime()).is.greaterThan(takenUntil.getTime() - 1);

    debug('### reclaimTask using temp creds from claim');
    await base.testing.sleep(100);
    // Works because r1.credentials expires at takenUntil, and are not revoked
    // on reclaimTask
    var queue = new helper.Queue({credentials: r1.credentials});
    var r4 = await queue.reclaimTask(taskId, 0);
    var takenUntil3 = new Date(r4.takenUntil);
    assume(takenUntil3.getTime()).is.greaterThan(takenUntil.getTime() - 1);
    assume(takenUntil3.getTime()).is.greaterThan(takenUntil2.getTime() - 1);

    debug('### reclaimTask using temp creds from reclaim');
    await base.testing.sleep(100);
    var queue2 = new helper.Queue({credentials: r4.credentials});
    var r5 = await queue2.reclaimTask(taskId, 0);
    var takenUntil4 = new Date(r5.takenUntil);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil.getTime() - 1);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil2.getTime() - 1);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil3.getTime() - 1);
  });

  test('claimTask is idempotent', async () => {
    var taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef);
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker2',
    }).then(() => {
      throw new Error('This request should have failed');
    }, (err) => {
      debug('Got error as expected: %j', err, err);
    });
  });

  test('claimTask requires scopes', async () => {
    var taskId = slugid.v4();

    await helper.queue.createTask(taskId, taskDef);

    // leave out a required scope
    helper.scopes(
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      debug('Got expected authentiation error: %s', err);
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err)  => {
      debug('Got expected authentiation error: %s', err);
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      debug('Got expected authentiation error: %s', err);
    });
  });
});