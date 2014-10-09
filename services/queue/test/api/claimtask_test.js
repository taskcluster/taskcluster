suite('Claim task', function() {
  var debug       = require('debug')('test:api:claim');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper');
  var subject     = helper.setup({title: "Claim task"});

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

  test("can claimTask", function() {
    var taskId = slugid.v4();
    var gotMessage = subject.listenFor(subject.queueEvents.taskRunning({
      taskId:   taskId
    }));

    var firstTakenUntil = new Date();

    debug("### Start listening for task running message");
    return gotMessage.ready.then(function() {
      debug("### Creating task");
      return subject.queue.createTask(taskId, taskDef);
    }).then(function() {
      // Reduce scopes available to test minimum set of scopes required
      subject.scopes(
        'queue:claim-task',
        'assume:worker-type:my-provisioner/my-worker',
        'assume:worker-id:my-worker-group/my-worker'
      );
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function(result) {
      debug("### Waiting for task running message");
      return gotMessage.message.then(function(message) {
        assert(firstTakenUntil < new Date(result.takenUntil),
               "takenUntil must in the future");
        firstTakenUntil = new Date(result.takenUntil);
        assert(_.isEqual(result.status, message.payload.status),
               "Message and result should have the same status");
        return subject.queue.status(taskId);
      }).then(function(result2) {
        assert(_.isEqual(result.status, result2.status),
               "Task status shouldn't have changed");
      });
    }).then(function() {
      return helper.sleep(1000);
    }).then(function() {
      // Again we talking about the first run, so runId must still be 0
      return subject.queue.reclaimTask(taskId, 0);
    }).then(function(result) {
      assert(firstTakenUntil < new Date(result.takenUntil),
             "takenUntil must have been updated");
    });
  });


  test("claimTask is idempotent", function() {
    var taskId = slugid.v4();
    return subject.queue.createTask(taskId, taskDef).then(function() {
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function() {
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker2'
      }).then(function() {
        assert(false, "This request should have failed");
      }, function(err) {
        debug("Got error as expected: %j", err, err);
      });
    });
  });

  test("can claimWork", function() {
    var taskId = slugid.v4();
    // Create datetime for created and deadline as 3 days later
    var created = new Date();
    var deadline = new Date();
    deadline.setDate(created.getDate() + 3);
    return subject.queue.createTask(taskId, taskDef).then(function() {
      // Reduce scopes available to test minimum set of scopes required
      subject.scopes(
        'queue:claim-task',
        'assume:worker-type:my-provisioner/my-worker',
        'assume:worker-id:my-worker-group/my-worker'
      );
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimWork('my-provisioner', 'my-worker', {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      });
    }).then(function(result) {
      assert(result.status.taskId === taskId, "Expected to get taskId");
    });
  });

  test("claimTask requires scopes", function() {
    var taskId = slugid.v4();
    return subject.queue.createTask(taskId, taskDef).then(function() {
      // leave out a required scope
      subject.scopes(
        'assume:worker-type:my-provisioner/my-worker',
        'assume:worker-id:my-worker-group/my-worker'
      );
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      }).then(function() {
        assert(false, "Expected an authentication error");
      }, function(err) {
        debug("Got expected authentiation error: %s", err);
      });
    }).then(function() {
      // leave out a required scope
      subject.scopes(
        'queue:claim-task',
        'assume:worker-id:my-worker-group/my-worker'
      );
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      }).then(function() {
        assert(false, "Expected an authentication error");
      }, function(err) {
        debug("Got expected authentiation error: %s", err);
      });
    }).then(function() {
      // leave out a required scope
      subject.scopes(
        'queue:claim-task',
        'assume:worker-type:my-provisioner/my-worker'
      );
      // First runId is always 0, so we should be able to claim it here
      return subject.queue.claimTask(taskId, 0, {
        workerGroup:    'my-worker-group',
        workerId:       'my-worker'
      }).then(function() {
        assert(false, "Expected an authentication error");
      }, function(err) {
        debug("Got expected authentiation error: %s", err);
      });
    });
  });
});