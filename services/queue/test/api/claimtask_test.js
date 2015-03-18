suite('Claim task', function() {
  var debug       = require('debug')('test:api:claim');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var expect      = require('expect.js');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
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

  test("can claimTask", async () => {
    var taskId = slugid.v4();

    debug("### Start listening for task running message");
    await helper.events.listenFor('running', helper.queueEvents.taskRunning({
      taskId:   taskId
    }));

    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claim task");
    // Reduce scopes available to test minimum set of scopes required
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker'
    );
    // First runId is always 0, so we should be able to claim it here
    var before = new Date();
    var r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    var takenUntil = new Date(r1.takenUntil);
    // Compare to time before the request, because claimTimeout is very small
    // so we can only count on takenUntil being larger than or equal to the
    // time before the request was made
    expect(takenUntil.getTime()).to.be.greaterThan(before.getTime() - 1);

    debug("### Waiting for task running message");
    var m1 = await helper.events.waitFor('running');
    expect(m1.payload.status).to.be.eql(r1.status);

    debug("### Fetch task status");
    var r2 = await helper.queue.status(taskId);
    expect(r2.status).to.be.eql(r1.status);

    await base.testing.sleep(100);

    // Again we talking about the first run, so runId must still be 0
    var r3 = await helper.queue.reclaimTask(taskId, 0);
    var takenUntil2 = new Date(r3.takenUntil);
    expect(takenUntil2.getTime()).to.be.greaterThan(takenUntil.getTime() - 1);
  });


  test("claimTask is idempotent", async () => {
    var taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef);
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker2'
    }).then(() => {
      expect().fail("This request should have failed");
    }, (err) => {
      debug("Got error as expected: %j", err, err);
    });
  });


  test("claimTask requires scopes", async () => {
    var taskId = slugid.v4();

    await helper.queue.createTask(taskId, taskDef);

    // leave out a required scope
    helper.scopes(
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker'
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    }).then(() => {
      expect().fail("Expected an authentication error");
    }, (err) => {
      debug("Got expected authentiation error: %s", err);
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-id:my-worker-group/my-worker'
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    }).then(() => {
      expect().fail("Expected an authentication error");
    }, (err)  => {
      debug("Got expected authentiation error: %s", err);
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker'
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    }).then(() => {
      expect().fail("Expected an authentication error");
    }, (err) => {
      debug("Got expected authentiation error: %s", err);
    });
  });
});