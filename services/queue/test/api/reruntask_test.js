suite('Rerun task', function() {
  var debug       = require('debug')('test:api:claim');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'my-provisioner',
    workerType:       'my-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          created.toJSON(),
    deadline:         deadline.toJSON(),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    },
    tags: {
      purpose:        'taskcluster-testing'
    }
  };

  test("create, claim, complete and rerun (is idempotent)", function() {
    var taskId = slugid.v4();

    return Promise.all([
      helper.events.listenFor('pending', helper.queueEvents.taskPending({
        taskId:   taskId,
        runId:    0
      })),
      helper.events.listenFor('running', helper.queueEvents.taskRunning({
        taskId:   taskId
      })),
      helper.events.listenFor('completed', helper.queueEvents.taskCompleted({
        taskId:   taskId
      })),
      helper.events.listenFor('pending-again', helper.queueEvents.taskPending({
        taskId:   taskId,
        runId:    1
      }))
    ]).then(function() {
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Waiting for pending message");
      return helper.events.waitFor('pending');
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Waiting for running message");
      return helper.events.waitFor('running');
    }).then(function() {
      debug("### Reporting task completed");
      return helper.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      debug("### Waiting for completed message");
      return helper.events.waitFor('completed');
    }).then(function() {
      debug("### Requesting task rerun");
      helper.scopes(
        'queue:rerun-task',
        'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ'
      );
      return helper.queue.rerunTask(taskId);
    }).then(function() {
      debug("### Waiting for pending message again");
      return helper.events.waitFor('pending-again');
    }).then(function() {
      debug("### Requesting task rerun (again)");
      return helper.queue.rerunTask(taskId);
    });
  });
});