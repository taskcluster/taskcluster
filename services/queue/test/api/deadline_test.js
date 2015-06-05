suite('Deadline expiration (deadline-reaper)', function() {
  var debug       = require('debug')('test:api:deadline');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var makeTask = () => {
    var task = {
      provisionerId:    'no-provisioner',
      workerType:       'test-worker',
                        // Legal because we allow a small bit of clock drift
      created:          taskcluster.fromNowJSON('- 5 seconds'),
      deadline:         taskcluster.fromNowJSON('10 seconds'),
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

  test("Resolve unscheduled task deadline", async () => {
    var {taskId, task} = makeTask();

    debug("### Define task");
    var r1 = await helper.queue.defineTask(taskId, task);
    assume(r1.status.state).equals('unscheduled');
    assume(r1.status.runs.length).equals(0);

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    debug("### Wait for task-exception message");
    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status.state).equals('exception');
    assume(m1.payload.status.runs.length).equals(1);
    assume(m1.payload.status.runs[0].reasonCreated).equals('exception');
    assume(m1.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r2 = await helper.queue.status(taskId);
    assume(r2.status).deep.equals(m1.payload.status);
  });

  test("Resolve pending task deadline", async () => {
    var {taskId, task} = makeTask();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status.state).equals('exception');
    assume(m1.payload.status.runs.length).equals(1);
    assume(m1.payload.status.runs[0].reasonCreated).equals('scheduled');
    assume(m1.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r2 = await helper.queue.status(taskId);
    assume(r2.status).deep.equals(m1.payload.status);
  });

  test("Resolve running task deadline", async () => {
    var {taskId, task} = makeTask();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);

    debug("### Claim task");
    var r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status.state).equals('exception');
    assume(m1.payload.status.runs.length).equals(1);
    assume(m1.payload.status.runs[0].reasonCreated).equals('scheduled');
    assume(m1.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r3 = await helper.queue.status(taskId);
    assume(r3.status).deep.equals(m1.payload.status);
  });

  test("Resolve completed task by deadline (no change)", async () => {
    var {taskId, task} = makeTask();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);

    debug("### Claim task");
    var r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Report task completed");
    var r3 = await helper.queue.reportCompleted(taskId, 0);

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    debug("### Ensure that we got no task-exception message");
    await new Promise(function(accept, reject) {
      helper.events.waitFor('except').then(reject, reject);
      accept(base.testing.sleep(500));
    });

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r4 = await helper.queue.status(taskId);
    assume(r4.status).deep.equals(r3.status);
  });
});