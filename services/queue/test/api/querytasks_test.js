suite('Query tasks', function() {
  var debug       = require('debug')('test:api:query');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var expect      = require('expect.js');
  var helper      = require('./helper');

  test("pendingTasks >= 1", async () => {
    var taskDef = {
      provisionerId:    'no-provisioner',
      workerType:       'query-test-worker',
      schedulerId:      'my-scheduler',
      taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
      routes:           [],
      retries:          5,
      created:          taskcluster.fromNowJSON(),
      deadline:         taskcluster.fromNowJSON('2 minutes'),
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

    var taskId1 = slugid.v4();
    var taskId2 = slugid.v4();

    debug("### Create tasks");
    await Promise.all([
      helper.queue.createTask(taskId1, taskDef),
      helper.queue.createTask(taskId2, taskDef)
    ])

    var r1 = await helper.queue.pendingTasks(
      'no-provisioner',
      'query-test-worker'
    );
    expect(r1.pendingTasks).to.be.greaterThan(1);
  });

  test("pendingTasks == 0", async () => {
    var r1 = await helper.queue.pendingTasks(
      'no-provisioner',
      'empty-test-worker'
    );
    expect(r1.pendingTasks).to.be(0);
  });
});