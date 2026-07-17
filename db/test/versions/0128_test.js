import { strict as assert } from 'node:assert';
import testing from '@taskcluster/lib-testing';
import tc from '@taskcluster/client';
import helper from '../helper.js';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1], 10);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), () => {
  helper.withDbForVersion();

  // A task queue with workers and pending tasks but zero claimed tasks used to
  // produce two rows for the same task_queue_id, one of which had
  // worker_count=0. See db/versions/0128.yml.
  test('pending tasks with no claimed tasks does not zero out worker_count', async () => {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    const db = await helper.setupDb('queue');

    await helper.upgradeTo(PREV_VERSION);

    // worker present, pending task present, no claimed tasks
    await db.fns.queue_worker_seen_with_last_date_active({
      task_queue_id_in: 'tq1',
      worker_group_in: 'wg1',
      worker_id_in: 'w1',
      expires_in: tc.fromNow('1 day'),
    });
    await db.fns.queue_pending_tasks_add('tq1', 5, 't1', 0, 'hint', tc.fromNow('1 hour'));

    // buggy version can emit a duplicate row for tq1
    const before = await db.fns.queue_worker_stats();
    const beforeTq1 = before.filter(r => r.task_queue_id === 'tq1');
    assert.equal(beforeTq1.length, 2, 'expected duplicate rows before migration');

    await helper.upgradeTo(THIS_VERSION);

    const after = await db.fns.queue_worker_stats();
    const afterTq1 = after.filter(r => r.task_queue_id === 'tq1');
    assert.equal(afterTq1.length, 1, 'expected a single row for tq1');
    assert.deepEqual(afterTq1[0], {
      task_queue_id: 'tq1',
      worker_count: 1,
      quarantined_count: 0,
      claimed_count: 0,
      pending_count: 1,
    });
  });
});
