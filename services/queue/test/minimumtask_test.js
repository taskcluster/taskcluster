suite('Create task (w. defaults)', () => {
  var debug       = require('debug')('test:createDefaults');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
  };

  test('All possible defaults', async () => {
    var taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
    );
    await helper.events.listenFor('is-defined', helper.queueEvents.taskDefined({
      taskId,
    }));
    await helper.events.listenFor('is-pending', helper.queueEvents.taskPending({
      taskId,
    }));

    debug('### Creating task');
    var r1 = await helper.queue.createTask(taskId, taskDef);

    debug('### Listening for task-defined');
    var m1 = await helper.events.waitFor('is-defined');
    assume(r1.status).deep.equals(m1.payload.status);

    // Wait for task-pending message
    var m2 = await helper.events.waitFor('is-pending');
    assume(m2.payload.status).deep.equals(m2.payload.status);

    var r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });
});