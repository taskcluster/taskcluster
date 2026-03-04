import slugid from 'slugid';
import assert from 'assert';
import taskcluster from '@taskcluster/client';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const taskDef = {
    taskQueueId: 'no-provisioner/prio-worker',
    schedulerId: 'prio-scheduler',
    projectId: 'prio-project',
    taskGroupId: slugid.v4(),
    dependencies: [],
    requires: 'all-completed',
    routes: [],
    priority: 'low',
    retries: 1,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    expires: taskcluster.fromNowJSON('7 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'priority test task',
      description: 'task used for reprioritization tests',
      owner: 'queue@example.com',
      source: 'https://taskcluster.net',
    },
    tags: {},
    extra: {},
  };

  const makeTaskDef = overrides => ({
    ...taskDef,
    ...overrides,
    created: taskcluster.fromNowJSON(),
    deadline: overrides?.deadline || taskcluster.fromNowJSON('3 days'),
    expires: overrides?.expires || taskcluster.fromNowJSON('7 days'),
  });

  test('changeTaskPriority updates task and pending queue', async () => {
    const taskId = slugid.v4();
    await helper.queue.createTask(taskId, makeTaskDef());

    helper.scopes(`queue:change-task-priority:${taskId}`);
    const result = await helper.queue.changeTaskPriority(taskId, { newPriority: 'highest' });
    assert.equal(result.status.taskId, taskId);
    assert.equal(result.status.priority, 'highest');

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select priority from queue_pending_tasks where task_id = $1', [taskId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].priority, 7);
    });
  });

  test('changeTaskPriority rejects resolved tasks', async () => {
    const taskId = slugid.v4();
    await helper.queue.createTask(taskId, makeTaskDef());
    helper.scopes(`queue:cancel-task:${taskDef.schedulerId}/${taskDef.taskGroupId}/${taskId}`);
    await helper.queue.cancelTask(taskId);
    await helper.withDbClient(async client => {
      await client.query('update tasks set ever_resolved = true where task_id = $1', [taskId]);
    });

    helper.scopes(`queue:change-task-priority:${taskId}`);
    await assert.rejects(
      () => helper.queue.changeTaskPriority(taskId, { newPriority: 'very-high' }),
      err => err.code === 'RequestConflict',
    );
  });

  test('changeTaskPriority enforces scopes', async () => {
    const taskId = slugid.v4();
    await helper.queue.createTask(taskId, makeTaskDef());
    helper.scopes('queue:change-task-priority:some-other-task');

    await assert.rejects(
      () => helper.queue.changeTaskPriority(taskId, { newPriority: 'medium' }),
      err => err.code === 'InsufficientScopes',
    );
  });

  test('changeTaskGroupPriority updates all unresolved tasks', async () => {
    const taskGroupId = slugid.v4();
    const schedulerId = 'prio-scheduler';
    const tasks = [];
    for (let i = 0; i < 3; i++) {
      const id = slugid.v4();
      tasks.push(id);
      await helper.queue.createTask(id, makeTaskDef({ taskGroupId }));
    }

    helper.scopes(`queue:change-task-group-priority:${schedulerId}/${taskGroupId}`);
    const response = await helper.queue.changeTaskGroupPriority(taskGroupId, { newPriority: 'very-high' });
    assert.equal(response.taskGroupId, taskGroupId);
    assert.equal(response.newPriority, 'very-high');
    assert.equal(response.tasksAffected, tasks.length);
    assert.deepEqual(new Set(response.taskIds).size, tasks.length);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select distinct priority from queue_pending_tasks where task_id = any($1::text[])', [tasks]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].priority, 6);
    });
  });

  test('reprioritized task keeps new priority when rerun', async () => {
    const taskId = slugid.v4();
    await helper.queue.createTask(taskId, makeTaskDef());

    helper.scopes(`queue:change-task-priority:${taskId}`);
    await helper.queue.changeTaskPriority(taskId, { newPriority: 'highest' });

    helper.scopes(`queue:cancel-task:${taskDef.schedulerId}/${taskDef.taskGroupId}/${taskId}`);
    await helper.queue.cancelTask(taskId);

    helper.scopes(`queue:rerun-task:${taskDef.schedulerId}/${taskDef.taskGroupId}/${taskId}`);
    await helper.queue.rerunTask(taskId);

    await helper.withDbClient(async client => {
      const { rows } = await client.query('select priority, run_id from queue_pending_tasks where task_id = $1 order by run_id desc limit 1', [taskId]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].priority, 7);
    });
  });
});
