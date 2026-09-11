import { strict as assert } from 'node:assert';
import testing from '@taskcluster/lib-testing';
import tc from '@taskcluster/client';
import helper from '../helper.js';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1], 10);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), () => {
  helper.withDbForVersion();

  test('adds batched task queue counts', async () => {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    const db = await helper.setupDb('queue');

    await helper.upgradeTo(PREV_VERSION);
    await db.fns.queue_pending_tasks_add('p1/w1', 0, 'pending', 0, 'hint', tc.fromNow('1 hour'));
    await db.fns.queue_claimed_task_put('claimed', 0, tc.fromNow('1 hour'), 'p2/w2', 'wg', 'worker');

    await helper.upgradeTo(THIS_VERSION);

    const result = await db.fns.queue_task_queue_counts(JSON.stringify(['p2/w2', 'missing/queue', 'p1/w1']));
    assert.deepEqual(Object.fromEntries(result.map(({ task_queue_id, ...counts }) => [task_queue_id, counts])), {
      'p2/w2': { pending_count: 0, claimed_count: 1 },
      'missing/queue': { pending_count: 0, claimed_count: 0 },
      'p1/w1': { pending_count: 1, claimed_count: 0 },
    });
  });
});
