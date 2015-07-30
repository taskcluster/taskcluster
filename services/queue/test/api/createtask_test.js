suite('Create task', function() {
  var debug       = require('debug')('test:api:create');
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
    // let's just test a large routing key too, 90 chars please :)
    routes:           ["--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---." +
                       "--- long routing key ---.--- long routing key ---"],
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    expires:          taskcluster.fromNowJSON('10 days'),
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
    extra: {
      myUsefulDetails: {
        property:     "that is useful by external service!!"
      }
    }
  };

  test("createTask", async () => {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
      'queue:route:*'
    );
    debug("### Start listening for messages");
    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskId
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskId
    }));

    debug("### Create task");
    var r1 = await helper.queue.createTask(taskId, taskDef);

    debug("### Wait for defined message");
    var m1 = await helper.events.waitFor('is-defined');
    assume(r1.status).deep.equals(m1.payload.status);

    debug("### Wait for pending message");
    var m2 = await helper.events.waitFor('is-pending');
    assume(r1.status).deep.equals(m1.payload.status);

    debug("### Get task status");
    var r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  test("createTask (without required scopes)", async () => {
    var taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:my-provisioner/another-worker',
      'queue:route:wrong-route'
    );
    await helper.queue.createTask(taskId, taskDef).then(() => {
      throw new Error("Expected an authentication error");
    }, (err) => {
      debug("Got expected authentication error: %s", err);
    });
  });

  test("createTask is idempotent", async () => {
    var taskId = slugid.v4();

    var r1 = await helper.queue.createTask(taskId, taskDef);
    var r2 = await helper.queue.createTask(taskId, taskDef);
    assume(r1).deep.equals(r2);

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, _.defaults({
      workerType:   "another-worker"
    }, taskDef)).then(() => {
      throw new Error("This operation should have failed!");
    }, (err) => {
      assume(err.statusCode).equals(409);
      debug("Expected error: %j", err, err);
    });
  });


  test("defineTask", async () => {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:route:---*'
    );
    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId:   taskId
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId:   taskId
    }));

    await helper.queue.defineTask(taskId, taskDef);
    await helper.events.waitFor('is-defined');

    // Fail execution, if the task-pending event arrives
    await new Promise((accept, reject) => {
      helper.events.waitFor('is-pending').then(reject, reject);
      setTimeout(accept, 500);
    }).catch(() => {
      throw new Error("Didn't expect task-pending message to arrive!");
    });
  });

  test("defineTask and scheduleTask", async () => {
    var taskId = slugid.v4();
    var taskIsScheduled = false;

    await helper.events.listenFor('pending', helper.queueEvents.taskPending({
      taskId: taskId
    }))

    var gotMessage = helper.events.waitFor('pending').then((message) => {
      assert(taskIsScheduled, "Got pending message before scheduleTask");
      return message;
    });

    await helper.queue.defineTask(taskId, taskDef);
    await base.testing.sleep(500);

    taskIsScheduled = true;
    helper.scopes(
      'queue:schedule-task',
      'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ'
    );
    var r1 = await helper.queue.scheduleTask(taskId);
    var m1 = await gotMessage;
    assume(r1.status).deep.equals(m1.payload.status);
  });

  test("defineTask is idempotent", async () => {
    var taskId = slugid.v4();
    await helper.queue.defineTask(taskId, taskDef);
    await helper.queue.defineTask(taskId, taskDef);

    // Verify that we can't modify the task
    await helper.queue.defineTask(taskId, _.defaults({
      workerType:   "another-worker"
    }, taskDef)).then(() => {
      throw new Error("This operation should have failed!");
    }, (err) => {
      assume(err.statusCode).equals(409);
      debug("Expected error: %j", err, err);
    });
  });

  test("defineTask is idempotent (with date format variance)", async () => {
    var taskId = slugid.v4();
    // You can add as many ms fractions as you like in the date format
    // but we won't store them, so we have to handle this case right
    var x = '234324Z';
    var taskDef2 = _.defaults({
      created:      taskDef.created.substr(0, taskDef.created.length - 1)   + x,
      deadline:     taskDef.deadline.substr(0, taskDef.deadline.length - 1) + x,
      expires:      taskDef.expires.substr(0, taskDef.expires.length - 1)   + x
    }, taskDef)
    await helper.queue.defineTask(taskId, taskDef2);
    await helper.queue.defineTask(taskId, taskDef2);

    // Verify that we can't modify the task
    await helper.queue.defineTask(taskId, _.defaults({
      workerType:   "another-worker"
    }, taskDef)).then(() => {
      throw new Error("This operation should have failed!");
    }, (err) => {
      assume(err.statusCode).equals(409);
      debug("Expected error: %j", err, err);
    });
  });

  test("createTask invalid taskId -> 400", async () => {
    var taskId = "my-invalid-slugid";

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, taskDef).then(() => {
      throw new Error("This operation should have failed!");
    }, (err) => {
      assume(err.statusCode).equals(400);
      debug("Expected error: %j", err, err);
    });
  });
});