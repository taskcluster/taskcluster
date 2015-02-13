suite('Task Expiration (expire-tasks)', function() {
  var debug       = require('debug')('test:api:expireTasks');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var expect      = require('expect.js');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var makeTask = () => {
    var task = {
      provisionerId:    'no-provisioner',
      workerType:       'test-worker',
      created:          taskcluster.utils.fromNow(),
      deadline:         taskcluster.utils.fromNow('1 day'),
                        // Notice that in config/test.js we've configured
                        // expire-tasks to expire 4 days before expires
      expires:          taskcluster.utils.fromNow('2 day'),
      retries:          1,
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue'
      }
    };
    return {taskId: slugid.v4(), task};
  }

  test("createTask, claimTask, reportCompleted, let expire...", async () => {
   var {taskId, task} = makeTask();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, task);
    expect(r1.status.state).to.be('pending');
    expect(r1.status.runs.length).to.be(1);

    debug("### Claim task");
    var r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Report task completed");
    var r3 = await helper.queue.reportCompleted(taskId, 0);

    debug("### Validate task status");
    var r4 = await helper.queue.status(taskId);
    expect(r4.status).to.be.eql(r3.status);

    debug("### Expire tasks");
    await helper.expireTasks();

    debug("### Check that task is gone");
    await helper.queue.status(taskId).then(() => {
      expect().fail("Expected the task to be missing");
    }, (err) => {
      debug("Expected error: %s, tasks have been expired as expected!", err);
      expect(err.statusCode).to.be(404);
    });
  });
});