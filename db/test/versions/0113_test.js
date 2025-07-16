import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';
import tc from 'taskcluster-client';
import helper from '../helper.js';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('multiple claimed records are counted once for stats', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    const db = await helper.setupDb('queue');

    await helper.upgradeTo(PREV_VERSION);

    await db.fns.queue_claimed_task_put('t1', 0, tc.fromNow('5 minutes'), 'tq1', 'wg1', 'w1');
    await db.fns.queue_claimed_task_put('t1', 0, tc.fromNow('10 minutes'), 'tq1', 'wg1', 'w1');

    const counts = await db.fns.queue_claimed_tasks_count('tq1');
    assert.equal(counts[0].queue_claimed_tasks_count, 2);

    // check updated query that was correct but used string concat instead tuples
    const queueWorkerStats = await db.fns.queue_worker_stats();
    assert.equal(queueWorkerStats[0].claimed_count, 1);

    await helper.upgradeTo(THIS_VERSION);
    const countsNew = await db.fns.queue_claimed_tasks_count('tq1');
    assert.equal(countsNew[0].queue_claimed_tasks_count, 1);

    const queueWorkerStats2 = await db.fns.queue_worker_stats();
    assert.equal(queueWorkerStats2[0].claimed_count, 1);
  });
});
