suite('Rerun task', function() {
  var debug       = require('debug')('test:api:cancel');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
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

  test("defineTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Define task");
    var r1 = await helper.queue.defineTask(taskId, taskDef);
    assume(r1.status.state).equals('unscheduled');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('exception');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');

    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status).deep.equals(r2.status);

    debug("### Cancel Task (again)");
    var r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
  });

  test("createTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('scheduled');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');

    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status).deep.equals(r2.status);

    debug("### Cancel Task (again)");
    var r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
  });

  test("createTask, claimTask, cancelTask (idempotent)", async () => {
    var taskId = slugid.v4();

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');

    debug("### Claim task");
    var r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    assume(r1.status.state).equals('running');

    debug("### Listen for task-exception");
    await helper.events.listenFor('except', helper.queueEvents.taskException({
      taskId:     taskId
    }));

    debug("### Cancel Task");
    var r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status.state).equals('exception');
    assume(r3.status.runs.length).equals(1);
    assume(r3.status.runs[0].state).equals('exception');
    assume(r3.status.runs[0].reasonCreated).equals('scheduled');
    assume(r3.status.runs[0].reasonResolved).equals('canceled');

    var m1 = await helper.events.waitFor('except');
    assume(m1.payload.status).deep.equals(r3.status);

    debug("### Cancel Task (again)");
    var r4 = await helper.queue.cancelTask(taskId);
    assume(r4.status).deep.equals(r3.status);
  });
});