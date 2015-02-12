suite('Retry tasks (claim-expired)', function() {
  var debug       = require('debug')('test:api:retry');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var expect      = require('expect.js');
  var helper      = require('./helper')();

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    created:          taskcluster.utils.fromNow(),
    deadline:         taskcluster.utils.fromNow('3 days'),
    retries:          1,
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    }
  };

  test("createTask, claimTask, claim-expired, retry, ...", async () => {
    var taskId = slugid.v4();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, taskDef);

    debug("### Claim task (runId: 0)");
    var r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Start listening");
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:         taskId,
      runId:          1
    }));
    await helper.events.listenFor('except-0', helper.queueEvents.taskException({
      taskId:         taskId,
      runId:          0
    }));

    debug("### Start claimReaper");
    var claimReaper = await helper.claimReaper();

    debug("### Wait for task-exception message");
    var m1 = await helper.events.waitFor('is-pending');
    expect(m1.payload.status.runs.length).to.be(2);
    expect(m1.payload.status.runs[0].state).to.be('exception');
    expect(m1.payload.status.runs[0].reasonResolved).to.be('claim-expired');

    debug("### Ensure that we got no task-exception message");
    await new Promise(function(accept, reject) {
      helper.events.waitFor('except-0').then(reject, reject);
      accept(base.testing.sleep(500));
    });

    debug("### Stop claimReaper");
    await claimReaper.terminate();

    debug("### Task status");
    var r3 = await helper.queue.status(taskId);
    expect(r3.status.state).to.be('pending');

    debug("### Claim task (runId: 1)");
    var r4 = await helper.queue.claimTask(taskId, 1, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    expect(r4.status.retriesLeft).to.be(0);

    debug("### Start listening for task-exception");
    await helper.events.listenFor('except-1', helper.queueEvents.taskException({
      taskId:         taskId,
      runId:          1
    }));

    debug("### Start claimReaper (again)");
    var claimReaper = await helper.claimReaper();

    debug("### Wait for task-exception message (again)");
    var m2 = await helper.events.waitFor('except-1');
    expect(m2.payload.status.runs.length).to.be(2);
    expect(m2.payload.status.runs[0].state).to.be('exception');
    expect(m2.payload.status.runs[0].reasonResolved).to.be('claim-expired');
    expect(m2.payload.status.runs[1].state).to.be('exception');
    expect(m2.payload.status.runs[1].reasonResolved).to.be('claim-expired');

    debug("### Stop claimReaper (again)");
    await claimReaper.terminate();

    debug("### Task status (again)");
    var r5 = await helper.queue.status(taskId);
    expect(r5.status.state).to.be('exception');
  });
});