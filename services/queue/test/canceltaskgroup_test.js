const _ = require('lodash');
const assert = require('assert').strict;
const debug = require('debug')('test:cancel');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = (name, extra = {}) => ({
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    taskId: slugid.v4(),
    routes: [],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('1 day'),
    scopes: [],
    payload: {},
    metadata: {
      name,
      description: 'Task created during unit tests',
      owner: 'tceng@taskcluster.net',
      source: 'https://github.com/taskcluster/taskcluster',
    },
    ...extra,
  });

  test('cancel unsealed task group should fail', async () => {
    const taskGroupId = slugid.v4();
    const projectId = 'test-proj-1';
    const schedulerId = 'test-sched-1';

    // Use the same task definition for everything
    const { taskId, ...def } = taskDef('task-with-scope-check', {
      taskGroupId,
      projectId,
      schedulerId,
    });

    debug('### Create task');
    await helper.queue.createTask(taskId, def);

    await assert.rejects(
      () => helper.queue.cancelTaskGroup(taskGroupId),
      err => err.statusCode === 409,
    );

    helper.clearPulseMessages();
  });

  test('createTasks, sealTaskGroup, cancelTaskGroup', async () => {
    const INITIAL_TASK_COUNT = 5;
    const taskGroupId = slugid.v4();

    // Use the same task definition for everything
    const taskDefs = new Array(INITIAL_TASK_COUNT).fill(0)
      .map((_, i) => taskDef(`test-task-${i}`, { taskGroupId }));

    debug('### Create tasks');
    const responses = await Promise.all(taskDefs.map(({ taskId, ...def }) =>
      helper.queue.createTask(taskId, def),
    ));

    debug('### Sealing task group');
    await helper.queue.sealTaskGroup(taskGroupId);

    assume(responses.length).equals(INITIAL_TASK_COUNT);
    const r1 = responses[0];
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');
    helper.assertPulseMessage('task-defined', m => _.includes(m.routingKey, r1.status.taskId));
    helper.assertPulseMessage('task-pending', m => _.includes(m.routingKey, r1.status.taskId));

    debug('### Cancel Task Group');
    const r2 = await helper.queue.cancelTaskGroup(taskGroupId);
    assume(r2.taskGroupId).equals(taskGroupId);
    assume(r2.taskGroupSize).equals(INITIAL_TASK_COUNT);
    assume(r2.cancelledCount).equals(INITIAL_TASK_COUNT);
    assume(r2.taskIds.length).equals(INITIAL_TASK_COUNT);

    for (const td of taskDefs) {
      assume(r2.taskIds).includes(td.taskId);
      helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status.taskId, td.taskId));
    }

    helper.clearPulseMessages();

    debug('### Cancel Task Group (again)');
    const r3 = await helper.queue.cancelTaskGroup(taskGroupId);
    assume(r3.taskGroupSize).equals(INITIAL_TASK_COUNT);
    assume(r3.cancelledCount).equals(0);
  });

  test('cancel task group with scopes', async () => {
    const taskGroupId = slugid.v4();
    const projectId = 'test-proj-1';
    const schedulerId = 'test-sched-1';

    // Use the same task definition for everything
    const { taskId, ...def } = taskDef('task-with-scope-check', {
      taskGroupId,
      projectId,
      schedulerId,
    });

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, def);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');

    debug('### Sealing task group');
    await helper.queue.sealTaskGroup(taskGroupId);

    debug('### Try to cancel with incorrect scopes');
    helper.scopes('queue:cancel-task-group:wrong-scheduler/wrong-task-group');
    await assert.rejects(
      () => helper.queue.cancelTaskGroup(taskGroupId),
      err => err.statusCode === 403,
    );

    helper.scopes(`queue:cancel-task-group:${schedulerId}/${taskGroupId}`);
    const r3 = await helper.queue.cancelTaskGroup(taskGroupId);
    assume(r3.taskGroupSize).equals(1);
    assume(r3.cancelledCount).equals(1);

    helper.clearPulseMessages();
  });

  test('cancel group which has some tasks resolved', async () => {
    const INITIAL_TASK_COUNT = 3;
    const taskGroupId = slugid.v4();

    // Use the same task definition for everything
    const taskDefs = new Array(INITIAL_TASK_COUNT).fill(0)
      .map((_, i) => taskDef(`test-task-${i}`, { taskGroupId }));

    debug('### Create tasks');
    const responses = await Promise.all(taskDefs.map(({ taskId, ...def }) =>
      helper.queue.createTask(taskId, def),
    ));

    assume(responses.length).equals(INITIAL_TASK_COUNT);
    const r1 = responses[0];
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');

    debug('### Cancel first task');
    await helper.queue.cancelTask(taskDefs[0].taskId);

    debug('### Sealing task group');
    await helper.queue.sealTaskGroup(taskGroupId);

    debug('### Cancel Task Group');
    const r2 = await helper.queue.cancelTaskGroup(taskGroupId);
    assume(r2.taskGroupId).equals(taskGroupId);
    assume(r2.taskGroupSize).equals(INITIAL_TASK_COUNT);
    assume(r2.cancelledCount).equals(2);
    assume(r2.taskIds.sort()).deep.equals(taskDefs.slice(1).map(({ taskId }) => taskId).sort());
  });
});
