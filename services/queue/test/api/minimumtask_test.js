suite('Create task (w. defaults)', function() {
  var debug       = require('debug')('test:api:createDefaults');
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
    created:          created.toJSON(),
    deadline:         deadline.toJSON(),
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    }
  };

  test("All possible defaults", function() {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:my-provisioner/my-worker'
    );
    return Promise.all([
      helper.events.listenFor('is-defined',  helper.queueEvents.taskDefined({
        taskId:   taskId
      })),
      helper.events.listenFor('is-pending',  helper.queueEvents.taskPending({
        taskId:   taskId
      }))
    ]).then(function() {
      return helper.queue.createTask(taskId, taskDef);
    }).then(function(result) {
      return helper.events.waitFor('is-defined').then(function(message) {
        assert(_.isEqual(result.status, message.payload.status),
               "Message and result should have the same status");
      }).then(function() {
        return helper.events.waitFor('is-pending').then(function(message) {
          assert(_.isEqual(result.status, message.payload.status),
                 "Message and result should have the same status");
          return helper.queue.status(taskId);
        }).then(function(result2) {
          assert(_.isEqual(result.status, result2.status),
                 "Task status shouldn't have changed");
        });
      });
    }).then(null, function(err) {
      debug("Got unexpected error: %s", err, err.stack);
      throw err;
    });
  });
});