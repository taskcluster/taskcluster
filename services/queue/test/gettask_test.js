import slugid from 'slugid';
import assert from 'assert';
import taskcluster from 'taskcluster-client';
import assume from 'assume';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = {
    taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    projectId: 'my-project',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    dependencies: [],
    requires: 'all-completed',
    routes: [],
    priority: 'lowest',
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    expires: taskcluster.fromNowJSON('3 days'),
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
    extra: {},
  };

  let taskId;

  const makeTask = (expiration) => {
    const task = {
      taskQueueId: 'no-provisioner-extended-extended/test-worker-extended-extended',
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('1 day'),
      // Notice that in config/test.js we've configured
      // expire-tasks to expire 4 days before expires
      expires: taskcluster.fromNowJSON(expiration),
      retries: 1,
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    };
    return { taskId: slugid.v4(), task };
  };

  setup(async function () {
    taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef);
  });

  test('task(taskId) is correct', async () => {
    helper.scopes(`queue:get-task:${taskId}`);
    const taskDef2 = await helper.queue.task(taskId);
    assume(`${taskDef2.provisionerId}/${taskDef2.workerType}`).equals(taskDef.taskQueueId);
    delete taskDef2.provisionerId;
    delete taskDef2.workerType;
    assume(taskDef2).deep.equals(taskDef);
  });

  test('tasks is correct for multiple tasks', async () => {
    let { taskId: taskId2, task: task2 } = makeTask('5 days');
    await helper.queue.createTask(taskId2, task2);
    task2 = await helper.queue.task(taskId2);
    let { taskId: taskId3, task: task3 } = makeTask('6 days');
    await helper.queue.createTask(taskId3, task3);
    task3 = await helper.queue.task(taskId3);
    let { taskId: taskId4, task: task4 } = makeTask('1 day');
    await helper.queue.createTask(taskId4, task4);
    task4 = await helper.queue.task(taskId4);

    let res = await helper.queue.tasks({ taskIds: [taskId2, taskId3, taskId4] });
    let tasks = res.tasks;

    // Convert to object for easy comparison. See `tasks-response.yml`
    // for an explanation of why it doesn't return an object.
    tasks = tasks.reduce((acc, curr) => {
      acc[curr.taskId] = curr.task;
      return acc;
    }, {});

    const expectedTasks = {};
    expectedTasks[taskId2] = task2;
    expectedTasks[taskId3] = task3;
    expectedTasks[taskId4] = task4;

    assert.equal(Object.keys(expectedTasks).length, Object.keys(tasks).length);
    for (const [currentId, def] of Object.entries(expectedTasks)) {
      assert.deepStrictEqual(tasks[currentId], def);
    }

  });

  test('tasks is correct for a single task', async () => {
    const res = await helper.queue.tasks({ taskIds: [taskId] });
    const tasks = res.tasks;
    assert.equal(tasks.length, 1);
    const def = tasks[0].task;
    assert.equal(`${def.provisionerId}/${def.workerType}`, taskDef.taskQueueId);
    delete def.provisionerId;
    delete def.workerType;
    assert.deepStrictEqual(def, taskDef);
  });

  test('tasks requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.tasks({ taskIds: [taskId] }),
      err => err.code === 'InsufficientScopes');
  });

  test('task(taskId) requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.task(taskId),
      err => err.code === 'InsufficientScopes');
  });

  test('statuses is correct for multiple tasks', async () => {
    let { taskId: taskId2, task: task2 } = makeTask('5 days');
    await helper.queue.createTask(taskId2, task2);
    task2 = await helper.queue.status(taskId2);
    let { taskId: taskId3, task: task3 } = makeTask('6 days');
    await helper.queue.createTask(taskId3, task3);
    task3 = await helper.queue.status(taskId3);
    let { taskId: taskId4, task: task4 } = makeTask('1 day');
    await helper.queue.createTask(taskId4, task4);
    task4 = await helper.queue.status(taskId4);

    let res = await helper.queue.statuses({ taskIds: [taskId2, taskId3, taskId4] });
    let statuses = res.statuses;

    // Convert to object for easy comparison. See `tasks-statuses-response.yml`
    // for an explanation of why it doesn't return an object.
    statuses = statuses.reduce((acc, curr) => {
      acc[curr.taskId] = curr.status;
      return acc;
    }, {});
    const expectedStatuses = {};
    expectedStatuses[taskId2] = task2.status;
    expectedStatuses[taskId3] = task3.status;
    expectedStatuses[taskId4] = task4.status;

    assert.equal(Object.keys(expectedStatuses).length, Object.keys(statuses).length);
    for (const [currentId, def] of Object.entries(expectedStatuses)) {
      assert.deepStrictEqual(statuses[currentId], def);
    }
  });

  test('statuses is correct for a single task', async () => {
    const expectedStatus = await helper.queue.status(taskId);
    const res = await helper.queue.statuses({ taskIds: [taskId] });
    const statuses = res.statuses;
    assert.equal(statuses.length, 1);
    const status = statuses[0].status;
    assert.deepStrictEqual(status, expectedStatus.status);
  });

  test('statuses requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.statuses({ taskIds: [taskId] }),
      err => err.code === 'InsufficientScopes');

    helper.scopes(`queue:status:${taskId}`);
    await helper.queue.statuses({ taskIds: [taskId] }); // doesn't fail..
  });

  test('status(taskId) requires scopes', async () => {
    helper.scopes('none');

    await assert.rejects(
      () => helper.queue.status(taskId),
      err => err.code === 'InsufficientScopes');

    helper.scopes(`queue:status:${taskId}`);
    await helper.queue.status(taskId); // doesn't fail..
  });

});
