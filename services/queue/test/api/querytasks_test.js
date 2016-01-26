suite('Query tasks', function() {
  var debug       = require('debug')('test:api:query');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  test("pendingTasks >= 1", async () => {
    let taskDef = {
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

    let taskId1 = slugid.v4();
    let taskId2 = slugid.v4();

    debug("### Create tasks");
    await Promise.all([
      helper.queue.createTask(taskId1, taskDef),
      helper.queue.createTask(taskId2, taskDef)
    ]);

    let r1 = await helper.queue.pendingTasks(
      'no-provisioner',
      'query-test-worker'
    );
    assume(r1.pendingTasks).is.greaterThan(1);

    // Result is cached for 20 seconds, so adding one more and checking should
    // give the same result, as we're not waiting for the timeout
    await helper.queue.createTask(taskId1, taskDef);

    // Note: There is some timing here, but since the queue.pendingTasks result
    // is cached it ought to be really fast and take less than 20 seconds to
    // do: queue.createTask + queue.pendingTasks, if not that's also sort of a
    // bug we should investigate
    let r2 = await helper.queue.pendingTasks(
      'no-provisioner',
      'query-test-worker'
    );
    assume(r2.pendingTasks).is.equals(r1.pendingTasks);

    // WARNING: The test below this point is not fast and certainly not robust
    // enough to run all the time. But it can be easily activated if messing
    // with queueservice.js and you want to ensure that it still works.
    // Just comment out the return statement below.
    return; // STOP TEST HERE
    console.log("WARNING: Unstable test running, should be disabled on master");
    await base.testing.poll(async () => {
      // At some point in the future we have to got fetch a new result saying
      // more tasks are now in the queue...
      let r3 = await helper.queue.pendingTasks(
        'no-provisioner',
        'query-test-worker'
      );
      assume(r3.pendingTasks).is.greaterThan(r1.pendingTasks);
    }, 30, 1000);
  });

  test("pendingTasks == 0", async () => {
    let r1 = await helper.queue.pendingTasks(
      'no-provisioner',
      'empty-test-worker'
    );
    assume(r1.pendingTasks).equals(0);

    let r2 = await helper.queue.pendingTasks(
      'no-provisioner',
      'empty-test-worker'
    );
    assume(r2.pendingTasks).equals(0);
  });
});