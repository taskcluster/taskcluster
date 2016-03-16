suite('Get task', function() {
  var debug       = require('debug')('test:api:get');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    dependencies:     [],
    requires:         'all-completed',
    routes:           [],
    priority:         'normal',
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    expires:          taskcluster.fromNowJSON('3 days'),
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

  test("task(taskId) is correct", async () => {
    var taskId = slugid.v4();

    await helper.queue.createTask(taskId, taskDef);
    var taskDef2 = await helper.queue.task(taskId);
    assume(taskDef2).deep.equals(taskDef);
  });

  test("task(taskId) doesn't require credentials", async () => {
    var taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef);

    var queue = new helper.Queue();
    var taskDef2 = await queue.task(taskId);
    assume(taskDef2).deep.equals(taskDef);
  });
});