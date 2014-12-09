suite('Get task', function() {
  var debug       = require('debug')('test:api:get');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

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
    },
    extra: {}
  };

  test("getTask", function() {
    var taskId = slugid.v4();

    return helper.queue.createTask(taskId, taskDef).then(function(result) {
      return helper.queue.getTask(taskId);
    }).then(function(taskDef2) {
      assert(_.isEqual(taskDef, taskDef2), "Task should be what we uploaded");
    });
  });
});