import assert from 'node:assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1], 10);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), () => {
  helper.withDbForVersion();

  test('queue_pending_tasks_add_for_task still maps ordinary priorities after upgrade', async () => {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);

    const db = await helper.setupDb('queue');
    const taskId = 'abcDEFghiJKLmnoPQRstuv';
    const deadline = taskcluster.fromNow('1 hour');

    await db.fns.queue_pending_tasks_add_for_task('prov/wt', 'very-low', deadline, taskId, 0);

    const rows = await helper.withDbClient(async client => {
      const { rows } = await client.query('select priority from queue_pending_tasks where task_id = $1', [taskId]);
      return rows;
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, 2);
  });

  test('queue_pending_tasks_add_for_task raises rather than silently defaulting priority `normal` to 0', async () => {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);

    const db = await helper.setupDb('queue');
    const taskId = 'abcDEFghiJKLmnoPQRstuv';
    const deadline = taskcluster.fromNow('1 hour');

    // `normal` is no longer accepted by the API (see issue #8858), but the
    // underlying `task_priority` enum value still exists at the DB layer.
    // Calling the function directly with it must now fail loudly (NOT NULL
    // violation on queue_pending_tasks.priority) instead of silently
    // enqueueing at priority 0, which is lower than every other priority.
    await assert.rejects(
      () => db.fns.queue_pending_tasks_add_for_task('prov/wt', 'normal', deadline, taskId, 0),
      err => err.code === '23502'
    );
  });

  test('downgrade restores the `else 0` fallback for priority `normal`', async () => {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    await helper.downgradeTo(PREV_VERSION);

    const db = await helper.setupDb('queue');
    const taskId = 'abcDEFghiJKLmnoPQRstuv';
    const deadline = taskcluster.fromNow('1 hour');

    await db.fns.queue_pending_tasks_add_for_task('prov/wt', 'normal', deadline, taskId, 0);

    const rows = await helper.withDbClient(async client => {
      const { rows } = await client.query('select priority from queue_pending_tasks where task_id = $1', [taskId]);
      return rows;
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, 0);
  });
});
