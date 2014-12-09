suite('Query tasks', function() {
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

  test("getPendingTasks", function() {
    var taskId1 = slugid.v4();
    var taskId2 = slugid.v4();
    return helper.queue.createTask(taskId1, taskDef).then(function() {
      return helper.queue.createTask(taskId2, taskDef);
    }).then(function() {
      return helper.queue.getPendingTasks('my-provisioner');
    }).then(function(result) {
      assert(result.tasks.length == 2, "Expected two tasks");
    });
  });
});