suite('Create task', function() {
  var debug       = require('debug')('test:api:create');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper');
  var subject     = helper.setup({title: "create task"});

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
    // let's just test a large routing key too, 90 chars please :)
    routes:           ["--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---"],
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

  test("createTask", function() {
    var taskId = slugid.v4();
    var isDefined = subject.listenFor(subject.queueEvents.taskDefined({
      taskId:   taskId
    }));
    var isPending = subject.listenFor(subject.queueEvents.taskPending({
      taskId:   taskId
    }));

    subject.scopes(
      'queue:create-task:my-provisioner/my-worker',
      'queue:route:*'
    );
    return subject.queue.createTask(taskId, taskDef).then(function(result) {
      return isDefined.then(function(message) {
        assert(_.isEqual(result.status, message.payload.status),
               "Message and result should have the same status");
      }).then(function() {
        return isPending.then(function(message) {
          assert(_.isEqual(result.status, message.payload.status),
                 "Message and result should have the same status");
          return subject.queue.status(taskId);
        }).then(function(result2) {
          assert(_.isEqual(result.status, result2.status),
                 "Task status shouldn't have changed");
        });
      });
    });
  });

  test("createTask (without required scopes)", function() {
    var taskId = slugid.v4();
    subject.scopes(
      'queue:create-task:my-provisioner/another-worker',
      'queue:route:wrong-route'
    );
    return subject.queue.createTask(taskId, taskDef).then(function() {
      assert(false, "Expected an authentication error");
    }, function(err) {
      debug("Got expected authentication error: %s", err);
    });
  });

  test("createTask is idempotent", function() {
    var taskId = slugid.v4();
    return subject.queue.createTask(taskId, taskDef).then(function(result) {
      return subject.queue.createTask(taskId, taskDef);
    }).then(function() {
      // Verify that we can't modify the task
      return subject.queue.createTask(taskId, _.defaults({
        routing: "try.with.another.routing.key"
      }, taskDef)).then(function() {
        assert(false, "This operation should have failed!");
      }, function(err) {
        debug("Expected error: %j", err, err);
      });
    });
  });

  test("defineTask", function() {
    var taskId = slugid.v4();
    var isDefined = subject.listenFor(subject.queueEvents.taskDefined({
      taskId:   taskId
    }));
    var gotMessage = subject.listenFor(subject.queueEvents.taskPending({
      taskId:   taskId
    }));

    subject.scopes(
      'queue:define-task:my-provisioner/my-worker',
      'queue:route:---*'
    );
    return subject.queue.defineTask(taskId, taskDef).then(function() {
      return isDefined;
    }).then(function() {
      return new Promise(function(accept, reject) {
        gotMessage.then(reject, reject);
        setTimeout(accept, 1000);
      });
    });
  });

  test("defineTask and scheduleTask", function() {
    var taskId = slugid.v4();
    var taskIsScheduled = false;
    var gotMessage = subject.listenFor(subject.queueEvents.taskPending({
      taskId:   taskId
    })).then(function(message) {
      assert(taskIsScheduled, "Got pending message before scheduleTask");
      return message;
    });

    return subject.queue.defineTask(taskId, taskDef).then(function() {
      return helper.sleep(1000);
    }).then(function() {
      taskIsScheduled = true;
      subject.scopes(
        'queue:schedule-task',
        'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ'
      );
      return subject.queue.scheduleTask(taskId);
    }).then(function(result) {
      return gotMessage.then(function(message) {
        assert(_.isEqual(result.status, message.payload.status),
               "Message and result should have the same status");
      });
    });
  });
});