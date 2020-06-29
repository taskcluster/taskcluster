const debug = require('debug')('test:create');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    provisionerId: 'no-provisioner-extended-extended',
    workerType: 'test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    // let's just test a large routing key too, 90 chars please :)
    routes: ['--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---.' +
                       '--- long routing key ---.--- long routing key ---'],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    expires: taskcluster.fromNowJSON('10 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose: 'taskcluster-testing',
    },
    extra: {
      myUsefulDetails: {
        property: 'that is useful by external service!!',
      },
    },
  };

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  test('createTask', async () => {
    const taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:lowest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:my-scheduler-extended-extended',
      'queue:route:*',
    );

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);

    debug('### Check for log messages');
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-defined'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-defined',
      Fields: {taskId, v: 1},
      Severity: LEVELS.notice,
    });
    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-pending'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-pending',
      Fields: {taskId, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });

    debug('### Wait for defined message');
    helper.assertPulseMessage('task-defined', m => (
      _.isEqual(m.payload.status, r1.status) &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));

    debug('### Wait for pending message');
    helper.assertPulseMessage('task-pending', m => (
      _.isEqual(m.payload.status, r1.status) &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));

    debug('### Get task status');
    const r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  test('createTask (without required scopes)', async () => {
    const taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:lowest:my-provisioner/another-worker',
      'queue:route:wrong-route',
    );
    await helper.queue.createTask(taskId, taskDef).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      if (err.code !== 'InsufficientScopes') {
        throw err;
      }
    });
  });

  test('createTask (with ** scope)', async () => {
    const taskId = slugid.v4();
    helper.scopes(
      'queue:create-task:lowest:*',
      'queue:scheduler-id:my-scheduler-extended-extended',
      'abc:**',
      'queue:route:*',
    );
    await helper.queue.createTask(taskId, _.defaults({scopes: ['abc:**']}, taskDef))
      .then(
        () => { throw new Error('Expected an authentication error'); },
        (err) => {
          if (err.code !== 'InputError') {
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
      workerType: 'another-worker',
    }, taskDef)).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      if (err.code !== 'RequestConflict') {
        throw err;
      }
    });
  });

  test('createTask is idempotent even when it fails sending pulse messages', async () => {
    const taskId = slugid.v4();
    const publisher = await helper.load('publisher');
    // make the `this.publisher.taskDefined` call in createTask fail..
    const oldTD = publisher.taskDefined;
    publisher.taskDefined = async () => {
      debug('publisher.taskDefined failing with fake error');
      throw new Error('uhoh');
    };
    try {
      try {
        await helper.queue
          .use({retries: 0})
          .createTask(taskId, taskDef);
      } catch (err) {
        if (!err.toString().match(/uhoh/)) {
          throw err;
        }
      }
    } finally {
      publisher.taskDefined = oldTD;
    }
    await helper.queue.createTask(taskId, taskDef);
  });

  test('createTask is idempotent (with date format variance)', async () => {
    const taskId = slugid.v4();
    // You can add as many ms fractions as you like in the date format
    // but we won't store them, so we have to handle this case right
    const x = '234324Z';
    const taskDef2 = _.defaults({
      created: taskDef.created.substr(0, taskDef.created.length - 1) + x,
      deadline: taskDef.deadline.substr(0, taskDef.deadline.length - 1) + x,
      expires: taskDef.expires.substr(0, taskDef.expires.length - 1) + x,
    }, taskDef);
    await helper.queue.createTask(taskId, taskDef2);
    await helper.queue.createTask(taskId, taskDef2);

    // Verify that we can't modify the task
    await helper.queue.createTask(taskId, _.defaults({
      workerType: 'another-worker',
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
      created: taskcluster.fromNowJSON('15 min'),
      deadline: taskcluster.fromNowJSON('10 min'),
      expires: taskcluster.fromNowJSON('3 days'),
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
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('4 days'),
      expires: taskcluster.fromNowJSON('3 days'),
    }, taskDef);

    await helper.queue.createTask(taskId, taskDef2).then(() => {
      throw new Error('This operation should have failed!');
    }, (err) => {
      assume(err.statusCode).equals(400);
      debug('Expected error: %j', err, err);
    });
  });

  const makeSourceTask = (source) => {
    return {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'test-worker-extended-extended',
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('3 days'),
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: source,
      },
    };
  };

  test('Minimum task definition with all possible defaults', async () => {
    const taskDef = makeSourceTask('https://github.com/taskcluster/taskcluster-queue');
    const taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:lowest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:-',
    );

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined', m => _.isEqual(m.payload.status, r1.status));
    helper.assertPulseMessage('task-pending', m => _.isEqual(m.payload.status, r1.status));

    const r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  test('Minimum task definition with ssh source', async () => {
    const taskDef = makeSourceTask('ssh://git@github.com:taskcluster/taskcluster-queue');
    const taskId = slugid.v4();

    helper.scopes(
      'queue:create-task:lowest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:-',
    );

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined', m => _.isEqual(m.payload.status, r1.status));
    helper.assertPulseMessage('task-pending', m => _.isEqual(m.payload.status, r1.status));

    const r2 = await helper.queue.status(taskId);
    assume(r1.status).deep.equals(r2.status);
  });

  const makePriorityTask = (priority) => {
    return {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'test-worker-extended-extended',
      priority: priority,
      schedulerId: 'test-run',
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('30 min'),
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    };
  };

  test('Can create "high" w. queue:create-task:high:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:high:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high'));
  });

  test('Can create "high" w. queue:create-task:highest:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:highest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high'));
  });

  test('Can\'t create "high" with queue:create-task:low:<provisionerId>/<workerType>', async () => {
    helper.scopes(
      'queue:create-task:low:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('high')).then(() => {
      assert(false, 'Expected 400 error!');
    }, err => {
      debug('Got error as expected');
    });
  });

  test('Can create "normal" priority task with ..:lowest:.. scope', async () => {
    helper.scopes(
      'queue:create-task:lowest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('normal'));
  });

  test('Can create "lowest" priority task with ..:lowest:.. scope', async () => {
    helper.scopes(
      'queue:create-task:lowest:no-provisioner-extended-extended/test-worker-extended-extended',
      'queue:scheduler-id:test-run',
    );
    await helper.queue.createTask(slugid.v4(), makePriorityTask('lowest'));
  });
});
