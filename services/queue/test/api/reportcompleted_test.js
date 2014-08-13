suite('Report task completed', function() {
  var debug       = require('debug')('test:api:completed');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper');
  var subject     = helper.setup({title: "Report task completed"});

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
    routing:          "jonasfj-test.what-a-hack",
    retries:          5,
    priority:         1,
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
    var isCompleted = subject.listenFor(subject.queueEvents.taskCompleted({
      taskId:   taskId
    })).then(function(message) {
      assert(allowedToCompleteNow, "Completing at wrong time");
      return message;
    });
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      allowedToCompleteNow = true;
      debug("### Reporting task completed");
      subject.scopes(
        'queue:report-task-completed',
        'assume:worker-id:my-worker-group/my-worker'
      );
      return subject.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      return isCompleted.then(function(message) {
        assert(message.payload.status.runs[0].state === 'completed',
               "Expected message to say it was completed");
      });
    }).then(function() {
      debug("### Reporting task completed (again)");
      return subject.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    });
  });

  test("create, claim and complete (with bad scopes)", function() {
    var taskId = slugid.v4();
    debug("### Creating task");
    return subject.queue.createTask(taskId, taskDef).then(function() {
    }).then(function() {
      debug("### Claiming task");
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      debug("### Reporting task completed");
      subject.scopes(
        'assume:worker-id:my-worker-group/my-worker'
      );
      return subject.queue.reportCompleted(taskId, 0, {
        success:    true
      });
    }).then(function() {
      assert(false, "Expected authentication error");
    }, function(err) {
      debug("Got expected authentication error: %s", err);
    });
  });
});