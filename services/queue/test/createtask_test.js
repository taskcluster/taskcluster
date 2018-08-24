const debug       = require('debug')('test:create');
const assert      = require('assert');
const slugid      = require('slugid');
const _           = require('lodash');
const taskcluster = require('taskcluster-client');
const assume      = require('assume');
const helper      = require('./helper');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    // let's just test a large routing key too, 90 chars please :)
    routes:           ['--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---'],
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    expires:          taskcluster.fromNowJSON('10 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose:        'taskcluster-testing',
    },
    extra: {
      myUsefulDetails: {
        property:     'that is useful by external service!!',
      },
    },
  };

  test('createTask', async () => {
    const taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
      'queue:route:*',
    );

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);

    debug('### Wait for defined message');
    helper.checkNextMessage('task-defined', m =>
      assume(r1.status).deep.equals(m.payload.status));

    debug('### Wait for pending message');
    helper.checkNextMessage('task-pending', m =>
      assume(r1.status).deep.equals(m.payload.status));

    debug('### Get task status');
    const r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  test('createTask (without required scopes)', async () => {
    const taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:my-provisioner/another-worker',
      'queue:route:wrong-route',
    );
    await helper.queue.createTask(taskId, taskDef).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      if (err.code != 'InsufficientScopes') {
        throw err;
      }
    });
  });

  test('createTask (with ** scope)', async () => {
    const taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:*',
      'abc:**',
      'queue:route:*',
    );
    await helper.queue.createTask(taskId, _.defaults({scopes: ['abc:**']}, taskDef))
      .then(
        () => { throw new Error('Expected an authentication error'); },
        (err) => {
          if (err.code != 'InputValidationError') {
            throw err;
          }
        });
  });

  test('createTask is idempotent', async () => {
    const taskId = slugid.v4();

    const r1 = await helper.queue.createTask(taskId, taskDef);
    const r2 = await helper.queue.createTask(taskId, taskDef);
    assume(r1).deep.equals(r2);

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, _.defaults({
      workerType:   'another-worker',
    }, taskDef)).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      if (err.code !== 'RequestConflict') {
        throw err;
      }
    });
  });

  test('defineTask', async () => {
    const taskId = slugid.v4();

    helper.scopes(
      'queue:define-task:no-provisioner/test-worker',
      'queue:route:---*',
    );

    await helper.queue.defineTask(taskId, taskDef);

    helper.checkNextMessage('task-defined');
    helper.checkNoNextMessage('task-pending');
  });

  test('defineTask and scheduleTask', async () => {
    const taskId = slugid.v4();
    const taskIsScheduled = false;

    await helper.queue.defineTask(taskId, taskDef);
    helper.checkNextMessage('task-defined');
    helper.checkNoNextMessage('task-pending');

    helper.scopes(
      'queue:schedule-task',
      'assume:scheduler-id:my-scheduler/dSlITZ4yQgmvxxAi4A8fHQ',
    );
    const r1 = await helper.queue.scheduleTask(taskId);
    helper.checkNextMessage('task-pending', m => 
      assume(r1.status).deep.equals(m.payload.status));
  });

  test('defineTask is idempotent', async () => {
    const taskId = slugid.v4();
    await helper.queue.defineTask(taskId, taskDef);
    await helper.queue.defineTask(taskId, taskDef);

    // Verify that we can't modify the task
    await helper.queue.defineTask(taskId, _.defaults({
      workerType:   'another-worker',
    }, taskDef)).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(409);
      debug('Expected error: %j', err, err);
    });
  });

  test('defineTask is idempotent (with date format variance)', async () => {
    const taskId = slugid.v4();
    // You can add as many ms fractions as you like in the date format
    // but we won't store them, so we have to handle this case right
    const x = '234324Z';
    const taskDef2 = _.defaults({
      created:      taskDef.created.substr(0, taskDef.created.length - 1)   + x,
      deadline:     taskDef.deadline.substr(0, taskDef.deadline.length - 1) + x,
      expires:      taskDef.expires.substr(0, taskDef.expires.length - 1)   + x,
    }, taskDef);
    await helper.queue.defineTask(taskId, taskDef2);
    await helper.queue.defineTask(taskId, taskDef2);

    // Verify that we can't modify the task
    await helper.queue.defineTask(taskId, _.defaults({
      workerType:   'another-worker',
    }, taskDef)).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(409);
      debug('Expected error: %j', err, err);
    });
  });

  test('createTask invalid taskId -> 400', async () => {
    const taskId = 'my-invalid-slugid';

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, taskDef).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(400);
      debug('Expected error: %j', err, err);
    });
  });

  test('createTask w. created > deadline', async () => {
    const taskId = slugid.v4();
    const taskDef2 = _.defaults({
      created:      taskcluster.fromNowJSON('15 min'),
      deadline:     taskcluster.fromNowJSON('10 min'),
      expires:      taskcluster.fromNowJSON('3 days'),
    }, taskDef);

    await helper.queue.createTask(taskId, taskDef2).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(400);
      debug('Expected error: %j', err, err);
    });
  });

  test('createTask w. deadline > expires', async () => {
    const taskId = slugid.v4();
    const taskDef2 = _.defaults({
      created:      taskcluster.fromNowJSON(),
      deadline:     taskcluster.fromNowJSON('4 days'),
      expires:      taskcluster.fromNowJSON('3 days'),
    }, taskDef);

    await helper.queue.createTask(taskId, taskDef2).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(400);
      debug('Expected error: %j', err, err);
    });
  });

  test('Minimum task definition with all possible defaults', async () => {
    const taskDef = {
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
    const taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
    );

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    helper.checkNextMessage('task-defined', m =>
      assume(r1.status).deep.equals(m.payload.status));
    helper.checkNextMessage('task-pending', m =>
      assume(r1.status).deep.equals(m.payload.status));

    const r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  const makePriorityTask = (priority) => {
    return {
      provisionerId:    'no-provisioner',
      workerType:       'test-worker',
      priority:         priority,
      schedulerId:      'test-run',
      created:          taskcluster.fromNowJSON(),
      deadline:         taskcluster.fromNowJSON('30 min'),
      payload:          {},
      metadata: {
        name:           'Unit testing task',
        description:    'Task created during unit tests',
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue',
      },
    };
  };

  test('Can create "high" w. queue:create-task:high:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:high:no-provisioner/test-worker',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high'));
  });

  test('Can create "high" w. queue:create-task:highest:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:highest:no-provisioner/test-worker',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high'));
  });

  test('Can\'t create "high" with queue:create-task:low:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:low:no-provisioner/test-worker',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high')).then(() => {
      assert(false, 'Expected 400 error!');
    }, err => {
      debug('Got error as expected');
    });
  });

  // Test for compatibility only
  test('Can create "normal" without queue:task-priority:high', async () => {
    helper.scopes(
      'queue:create-task:no-provisioner/test-worker',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('normal'));
  });

});
