suite('Rerun task', function() {
  var debug       = require('debug')('test:api:cancel');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var expect      = require('expect.js');
  var helper      = require('./helper')();

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          taskcluster.utils.fromNow(),
    deadline:         taskcluster.utils.fromNow('3 days'),
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

  test("defineTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Define task");
    var r1 = await helper.queue.defineTask(taskId, taskDef);
    expect(r1.status.state).to.be('unscheduled');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r2 = await helper.queue.cancelTask(taskId);
    expect(r2.status.state).to.be('exception');
    expect(r2.status.runs.length).to.be(1);
    expect(r2.status.runs[0].state).to.be('exception');
    expect(r2.status.runs[0].reasonResolved).to.be('canceled');

    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status).to.be.eql(r2.status);

    debug("### Cancel Task (again)");
    var r3 = await helper.queue.cancelTask(taskId);
    expect(r3.status).to.be.eql(r2.status);
  });

  test("createTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);
    expect(r1.status.state).to.be('pending');
    expect(r1.status.runs.length).to.be(1);
    expect(r1.status.runs[0].state).to.be('pending');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r2 = await helper.queue.cancelTask(taskId);
    expect(r2.status.state).to.be('exception');
    expect(r2.status.runs.length).to.be(1);
    expect(r2.status.runs[0].state).to.be('exception');
    expect(r2.status.runs[0].reasonResolved).to.be('canceled');

    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status).to.be.eql(r2.status);

    debug("### Cancel Task (again)");
    var r3 = await helper.queue.cancelTask(taskId);
    expect(r3.status).to.be.eql(r2.status);
  });

  test("createTask, claimTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);
    expect(r1.status.state).to.be('pending');
    expect(r1.status.runs.length).to.be(1);
    expect(r1.status.runs[0].state).to.be('pending');

    debug("### Claim task");
    var r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    expect(r1.status.state).to.be('running');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r3 = await helper.queue.cancelTask(taskId);
    expect(r3.status.state).to.be('exception');
    expect(r3.status.runs.length).to.be(1);
    expect(r3.status.runs[0].state).to.be('exception');
    expect(r3.status.runs[0].reasonResolved).to.be('canceled');

    var m1 = await helper.events.waitFor('except');
    expect(m1.payload.status).to.be.eql(r3.status);

    debug("### Cancel Task (again)");
    var r4 = await helper.queue.cancelTask(taskId);
    expect(r4.status).to.be.eql(r3.status);
  });
});