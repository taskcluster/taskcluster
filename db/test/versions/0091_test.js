const assert = require('assert');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('new tables are created', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertNoTable('queue_pending_tasks');
    await helper.assertNoTable('queue_claimed_tasks');
    await helper.assertNoTable('queue_resolved_tasks');
    await helper.assertNoTable('queue_task_deadlines');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_pending_tasks');
    await helper.assertTable('queue_claimed_tasks');
    await helper.assertTable('queue_resolved_tasks');
    await helper.assertTable('queue_task_deadlines');
  });
  test('data is being migrated into new tables', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);
    const db = await helper.setupDb('queue');

    // insert some records into the old table
    const dt1 = taskcluster.fromNow('- 1 hour');
    const dt2 = taskcluster.fromNow('2 hours');

    const msg = obj => Buffer.from(JSON.stringify(obj)).toString('base64');

    await db.deprecatedFns.azure_queue_put_extra('claim-queue', msg({
      taskId: 'taskId',
      runId: 0,
      takenUntil: dt2.toJSON(),
    }), dt1, dt2, '', 0);
    await db.deprecatedFns.azure_queue_put_extra('resolved-queue', msg({
      taskId: 'taskId',
      taskGroupId: 'taskGroupId',
      schedulerId: 'schedulerId',
      resolution: 'completed',
    }), dt1, dt2, '', 0);
    await db.deprecatedFns.azure_queue_put_extra('deadline-queue', msg({
      taskId: 'taskId',
      taskGroupId: 'taskGroupId',
      schedulerId: 'schedulerId',
      deadline: dt2.toJSON(),
    }), dt1, dt2, '', 0);
    await db.deprecatedFns.azure_queue_put_extra('some-cryptic-queue-name', msg({
      taskId: 'taskId',
      runId: 1,
      hintId: 'hintId',
    }), dt1, dt2, 'task/queue-1', 5);

    await helper.upgradeTo(THIS_VERSION);

    const visibleIn = taskcluster.fromNow('1 minute');

    const [pending, claimed, resolved, deadlines] = await Promise.all([
      db.fns.queue_pending_tasks_get('task/queue-1', visibleIn, 1),
      db.fns.queue_claimed_task_get(visibleIn, 1),
      db.fns.queue_resolved_task_get(visibleIn, 1),
      db.fns.queue_task_deadline_get(visibleIn, 1),
    ]);

    assert.equal(pending.length, 1);
    assert.equal(pending[0].task_id, 'taskId');
    assert.equal(pending[0].run_id, 1);
    assert.equal(pending[0].hint_id, 'hintId');

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].task_id, 'taskId');
    assert.equal(claimed[0].run_id, 0);
    assert.equal(claimed[0].taken_until.toJSON(), dt2.toJSON());

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].task_id, 'taskId');
    assert.equal(resolved[0].task_group_id, 'taskGroupId');
    assert.equal(resolved[0].scheduler_id, 'schedulerId');
    assert.equal(resolved[0].resolution, 'completed');

    assert.equal(deadlines.length, 1);
    assert.equal(deadlines[0].task_id, 'taskId');
    assert.equal(deadlines[0].task_group_id, 'taskGroupId');
    assert.equal(deadlines[0].scheduler_id, 'schedulerId');
    assert.equal(deadlines[0].deadline.toJSON(), dt2.toJSON());
  });
});
