suite('Create task', function() {
  var debug       = require('debug')('test:api:create');
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
    // let's just test a large routing key too, 90 chars please :)
    routes:           ["--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---"],
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
    },
    extra: {
      myUsefulDetails: {
        property:     "that is useful by external service!!"
      }
    }
  };

  test("createTask", function() {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:my-provisioner/my-worker',
      'queue:route:*'
    );
    debug("### Start listening for messages");
    return Promise.all([
      helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
        taskId:   taskId
      })),
      helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
        taskId:   taskId
      }))
    ]).then(function() {
      debug("### Create task");
      return helper.queue.createTask(taskId, taskDef);
    }).then(function(result) {
      debug("### Wait for defined message");
      return helper.events.waitFor('is-defined').then(function(message) {
        assert(_.isEqual(result.status, message.payload.status),
               "Message and result should have the same status");
      }).then(function() {
        debug("### Wait for pending message");
        return helper.events.waitFor('is-pending').then(function(message) {
          assert(_.isEqual(result.status, message.payload.status),
                 "Message and result should have the same status");
          return helper.queue.status(taskId);
        }).then(function(result2) {
          assert(_.isEqual(result.status, result2.status),
                 "Task status shouldn't have changed");
        });
      });
    });
  });

  test("createTask (without required scopes)", function() {
    var taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:my-provisioner/another-worker',
      'queue:route:wrong-route'
    );
    return helper.queue.createTask(taskId, taskDef).then(function() {
      assert(false, "Expected an authentication error");
    }, function(err) {
      debug("Got expected authentication error: %s", err);
    });
  });

  test("createTask is idempotent", function() {
    var taskId = slugid.v4();
    return helper.queue.createTask(taskId, taskDef).then(function(result) {
      return helper.queue.createTask(taskId, taskDef);
    }).then(function() {
      // Verify that we can't modify the task
      return helper.queue.createTask(taskId, _.defaults({
        workerType:   "another-worker"
      }, taskDef)).then(function() {
        assert(false, "This operation should have failed!");
      }, function(err) {
        assert(err.statusCode === 409, "I would expect a 409 Conflict");
        debug("Expected error: %j", err, err);
      });
    });
  });

  test("defineTask", function() {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:define-task:my-provisioner/my-worker',
      'queue:route:---*'
    );
    return Promise.all([
      helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
        taskId:   taskId
      })),
      helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
        taskId:   taskId
      }))
    ]).then(function() {
      return helper.queue.defineTask(taskId, taskDef);
    }).then(function() {
      return helper.events.waitFor('is-defined');
    }).then(function() {
      return new Promise(function(accept, reject) {
        helper.events.waitFor('is-pending').then(reject, reject);
        setTimeout(accept, 1000);
      });
    });
  });

  test("defineTask and scheduleTask", function() {
    var taskId = slugid.v4();
    var taskIsScheduled = false;

    return helper.events.listenFor('pending', helper.queueEvents.taskPending({
      taskId: taskId
    })).then(function() {
      var gotMessage = helper.events.waitFor('pending').then(function(message) {
        assert(taskIsScheduled, "Got pending message before scheduleTask");
        return message;
      });
      return helper.queue.defineTask(taskId, taskDef).then(function() {
        return helper.sleep(1000);
      }).then(function() {
        taskIsScheduled = true;
        helper.scopes(
          'queue:schedule-task',
          'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ'
        );
        return helper.queue.scheduleTask(taskId);
      }).then(function(result) {
        return gotMessage.then(function(message) {
          assert(_.isEqual(result.status, message.payload.status),
                 "Message and result should have the same status");
        });
      });
    });
  });

  test("defineTask is idempotent", function() {
    var taskId = slugid.v4();
    return helper.queue.defineTask(taskId, taskDef).then(function(result) {
      return helper.queue.defineTask(taskId, taskDef);
    }).then(function() {
      // Verify that we can't modify the task
      return helper.queue.defineTask(taskId, _.defaults({
        workerType:   "another-worker"
      }, taskDef)).then(function() {
        assert(false, "This operation should have failed!");
      }, function(err) {
        assert(err.statusCode === 409, "I would expect a 409 Conflict");
        debug("Expected error: %j", err, err);
      });
    });
  });
});