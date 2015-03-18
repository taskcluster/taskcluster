suite('Deadline expiration (deadline-reaper)', function() {
  var debug       = require('debug')('test:api:deadline');
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
                        // Legal because we allow a small bit of clock drift
      created:          taskcluster.fromNowJSON('- 5 seconds'),
      deadline:         taskcluster.fromNowJSON('5 second'),
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
    expect(r1.status.state).to.be('unscheduled');
    expect(r1.status.runs.length).to.be(0);

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    debug("### Wait for task-exception message");
    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status.state).to.be('exception');
    expect(m1.payload.status.runs.length).to.be(1);
    expect(m1.payload.status.runs[0].reasonResolved).to.be('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r2 = await helper.queue.status(taskId);
    expect(r2.status).to.be.eql(m1.payload.status);
  });

  test("Resolve pending task deadline", async () => {
    var {taskId, task} = makeTask();

    debug("### Creating task");
    var r1 = await helper.queue.createTask(taskId, task);
    expect(r1.status.state).to.be('pending');
    expect(r1.status.runs.length).to.be(1);

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status.state).to.be('exception');
    expect(m1.payload.status.runs.length).to.be(1);
    expect(m1.payload.status.runs[0].reasonResolved).to.be('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r2 = await helper.queue.status(taskId);
    expect(r2.status).to.be.eql(m1.payload.status);
  });

  test("Resolve running task deadline", async () => {
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

    debug("### Start listening");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:         taskId
    }));

    debug("### Start deadlineReaper");
    var deadlineReaper = await helper.deadlineReaper();

    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status.state).to.be('exception');
    expect(m1.payload.status.runs.length).to.be(1);
    expect(m1.payload.status.runs[0].reasonResolved).to.be('deadline-exceeded');

    debug("### Stop deadlineReaper");
    await deadlineReaper.terminate();

    debug("### Validate task status");
    var r3 = await helper.queue.status(taskId);
    expect(r3.status).to.be.eql(m1.payload.status);
  });

  test("Resolve completed task by deadline (no change)", async () => {
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
    expect(r4.status).to.be.eql(r3.status);
  });
});