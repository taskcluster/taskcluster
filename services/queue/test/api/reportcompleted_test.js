suite('Report task completed', function() {
  var debug       = require('debug')('test:api:completed');
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

  test("create, claim and complete (is idempotent)", function() {
    var taskId = slugid.v4();
    var allowedToCompleteNow = false;
    var gotMessage = null;

    return helper.events.listenFor(
      'completed', helper.queueEvents.taskCompleted({taskId:   taskId})
    ).then(function() {
      gotMessage = helper.events.waitFor('completed').then(function(message) {
        assert(allowedToCompleteNow, "Completing at wrong time");
        return message;
      });
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToCompleteNow = true;
      debug("### Reporting task completed");
      helper.scopes(
        'queue:report-task-completed',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      return gotMessage.then(function(message) {
        assert(message.payload.status.runs[0].state === 'completed',
               "Expected message to say it was completed");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return helper.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    });
  });

  test("create, claim and fail task (is idempotent)", function() {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    return helper.events.listenFor('failed', helper.queueEvents.taskFailed({
      taskId:   taskId
    })).then(function() {
      gotMessage = helper.events.waitFor('failed').then(function(message) {
        assert(allowedToFailNow, "Failed at wrong time");
        return message;
      });
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToFailNow = true;
      debug("### Reporting task completed (success: false)");
      helper.scopes(
        'queue:report-task-completed',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportCompleted(taskId, 0, {
        success:    false
      });
    }).then(function() {
      return gotMessage.then(function(message) {
        assert(message.payload.status.runs[0].state === 'failed',
               "Expected message to say it was failed");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return helper.queue.reportCompleted(taskId, 0, {
        success:    false
      });
    });
  });

  test("create, claim and complete (with bad scopes)", function() {
    var taskId = slugid.v4();
    debug("### Creating task");
    return helper.queue.createTask(taskId, taskDef).then(function() {
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Reporting task completed");
      helper.scopes(
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      assert(false, "Expected authentication error");
    }, function(err) {
      debug("Got expected authentication error: %s", err);
    });
  });

  test("create, claim and reportCompleted (is idempotent)", function() {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    return helper.events.listenFor('done', helper.queueEvents.taskCompleted({
      taskId:   taskId
    })).then(function() {
      gotMessage = helper.events.waitFor('done').then(function(message) {
        assert(allowedToFailNow, "Failed at wrong time");
        return message;
      });
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToFailNow = true;
      debug("### Reporting task completed");
      helper.scopes(
        'queue:resolve-task',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportCompleted(taskId, 0, {});
    }).then(function() {
      return gotMessage.then(function(message) {
        assert(message.payload.status.runs[0].state === 'completed',
               "Expected message to say it was completed");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return helper.queue.reportCompleted(taskId, 0, {});
    });
  });

  test("create, claim and reportFailed (is idempotent)", function() {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    return helper.events.listenFor('failed', helper.queueEvents.taskFailed({
      taskId:   taskId
    })).then(function() {
      gotMessage = helper.events.waitFor('failed').then(function(message) {
        assert(allowedToFailNow, "Failed at wrong time");
        return message;
      });
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToFailNow = true;
      debug("### Reporting task failed");
      helper.scopes(
        'queue:resolve-task',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportFailed(taskId, 0);
    }).then(function() {
      return gotMessage.then(function(message) {
        assert(message.payload.status.runs[0].state === 'failed',
               "Expected message to say it was failed");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return helper.queue.reportFailed(taskId, 0);
    });
  });

  test("create, claim and reportException (is idempotent)", function() {
    var taskId = slugid.v4();
    var allowedToFailNow = false;
    var gotMessage = null;

    return helper.events.listenFor('exp', helper.queueEvents.taskException({
      taskId:   taskId
    })).then(function() {
      gotMessage = helper.events.waitFor('exp').then(function(message) {
        assert(allowedToFailNow, "Failed at wrong time");
        return message;
      });
      debug("### Creating task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return helper.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToFailNow = true;
      debug("### Reporting task exception");
      helper.scopes(
        'queue:resolve-task',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return helper.queue.reportException(taskId, 0, {
        reason:     'malformed-payload'
      });
    }).then(function() {
      return gotMessage.then(function(message) {
        assert(message.payload.status.runs[0].state === 'exception',
               "Expected message to say it was exception");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return helper.queue.reportException(taskId, 0, {
        reason:     'malformed-payload'
      });
    });
  });
});