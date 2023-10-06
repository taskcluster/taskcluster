const assert = require('assert');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  const insertOldRecords = async (db, dt1, dt2) => {
    const msg = obj => Buffer.from(JSON.stringify(obj)).toString('base64');
    await Promise.all([
      db.fns.azure_queue_put_extra('claim-queue', msg({
        taskId: 'taskId',
        runId: 0,
        takenUntil: dt2.toJSON(),
      }), dt1, dt2, '', 0),
      db.fns.azure_queue_put_extra('resolved-queue', msg({
        taskId: 'taskId',
        taskGroupId: 'taskGroupId',
        schedulerId: 'schedulerId',
        resolution: 'completed',
      }), dt1, dt2, '', 0),
      db.fns.azure_queue_put_extra('deadline-queue', msg({
        taskId: 'taskId',
        taskGroupId: 'taskGroupId',
        schedulerId: 'schedulerId',
        deadline: dt2.toJSON(),
      }), dt1, dt2, '', 0),
      db.fns.azure_queue_put_extra('some-cryptic-queue-name', msg({
        taskId: 'taskId',
        runId: 1,
        hintId: 'hintId',
      }), dt1, dt2, 'task/queue-1', 5),
    ]);
  };

  const assertRecordsExistInNewTables = async (db, dt1, dt2) => {
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
  };

  test('new tables are created', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertNoTable('queue_pending_tasks');
    await helper.assertNoTable('queue_claimed_tasks');
    await helper.assertNoTable('queue_resolved_tasks');
    await helper.assertNoTable('queue_task_deadlines');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_pending_tasks');
    await helper.assertIndexOnColumn('queue_pending_tasks', 'queue_pending_task_idx', 'task_id');
    await helper.assertTable('queue_claimed_tasks');
    await helper.assertIndexOnColumn('queue_claimed_tasks', 'queue_claimed_task_run_idx', 'task_id');
    await helper.assertTable('queue_resolved_tasks');
    await helper.assertIndexOnColumn('queue_resolved_tasks', 'queue_resolved_task_idx', 'task_id');
    await helper.assertTable('queue_task_deadlines');
    await helper.assertIndexOnColumn('queue_task_deadlines', 'queue_task_deadline_idx', 'task_id');
  });
  test('UP: data is being migrated into new tables', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);
    const db = await helper.setupDb('queue');

    // insert some records into the old table
    const dt1 = taskcluster.fromNow('- 1 hour');
    const dt2 = taskcluster.fromNow('2 hours');

    await insertOldRecords(db, dt1, dt2);
    await helper.upgradeTo(THIS_VERSION);
    await assertRecordsExistInNewTables(db, dt1, dt2);
  });

  test('existing functions should be patched to use new tables', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('queue');

    const dt1 = taskcluster.fromNow('- 1 hour');
    const dt2 = taskcluster.fromNow('2 hours');

    // those should route messages to proper locations
    await insertOldRecords(db, dt1, dt2);
    // records should automatically be routed into new tables
    await assertRecordsExistInNewTables(db, dt1, dt2);
  });

  test('DOWN: data is being put back into azure messages table', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('queue');

    // insert some records into the old table
    const dt1 = taskcluster.fromNow('- 1 hour');
    const dt2 = taskcluster.fromNow('2 hours');

    await insertOldRecords(db, dt1, dt2);

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('queue_pending_tasks');
    await helper.assertNoTable('queue_claimed_tasks');
    await helper.assertNoTable('queue_resolved_tasks');
    await helper.assertNoTable('queue_task_deadlines');

    // messages should be preserved in azure table
    await helper.withDbClient(async client => {
      const unwrap = msg => JSON.parse(Buffer.from(msg, 'base64').toString('utf8'));

      const { rows } = await client.query('select * from azure_queue_messages');

      assert.equal(rows.length, 4);
      const claim = rows.filter(r => r.queue_name === 'claim-queue');
      assert.equal(claim.length, 1);
      assert.equal(unwrap(claim[0].message_text).taskId, 'taskId');
      assert.equal(unwrap(claim[0].message_text).runId, 0);

      const resolved = rows.filter(r => r.queue_name === 'resolved-queue');
      assert.equal(resolved.length, 1);
      assert.equal(unwrap(resolved[0].message_text).taskId, 'taskId');
      assert.equal(unwrap(resolved[0].message_text).taskGroupId, 'taskGroupId');

      const deadline = rows.filter(r => r.queue_name === 'deadline-queue');
      assert.equal(deadline.length, 1);
      assert.equal(unwrap(deadline[0].message_text).taskId, 'taskId');
      assert.equal(unwrap(deadline[0].message_text).schedulerId, 'schedulerId');

      const pending = rows.filter(r => r.queue_name === 'some-cryptic-queue-name');
      assert.equal(pending.length, 1);
      assert.equal(unwrap(pending[0].message_text).taskId, 'taskId');
      assert.equal(unwrap(pending[0].message_text).runId, 1);
      assert.equal(pending[0].task_queue_id, 'task/queue-1');
    });
  });
});
