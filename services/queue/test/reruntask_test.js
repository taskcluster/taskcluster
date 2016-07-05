suite('Rerun task', function() {
  var debug       = require('debug')('test:rerun');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
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
      owner:          'jonasfj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose:        'taskcluster-testing',
    },
  };

  test('create, claim, complete and rerun (is idempotent)', async () => {
    let taskId = slugid.v4();

    await Promise.all([
      helper.events.listenFor('pending', helper.queueEvents.taskPending({
        taskId,
        runId:    0,
      })),
      helper.events.listenFor('running', helper.queueEvents.taskRunning({
        taskId,
      })),
      helper.events.listenFor('completed', helper.queueEvents.taskCompleted({
        taskId,
      })),
      helper.events.listenFor('pending-again', helper.queueEvents.taskPending({
        taskId:   taskId,
        runId:    1,
      })),
    ]);

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Waiting for pending message');
    await helper.events.waitFor('pending');

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Waiting for running message');
    await helper.events.waitFor('running');

    debug('### Reporting task completed');
    await helper.queue.reportCompleted(taskId, 0);

    debug('### Waiting for completed message');
    await helper.events.waitFor('completed');

    debug('### Requesting task rerun');
    helper.scopes(
      'queue:rerun-task',
      'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ',
    );
    await helper.queue.rerunTask(taskId);

    debug('### Waiting for pending message again');
    await helper.events.waitFor('pending-again');

    debug('### Requesting task rerun (again)');
    await helper.queue.rerunTask(taskId);
  });

  test('throw error on missing task', async () => {
    let taskId = slugid.v4();
    await helper.queue.rerunTask(taskId).catch(err => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'ResourceNotFound');
    });
  });
});
