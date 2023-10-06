import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';
import helper from '../helper';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  const expires = taskcluster.fromNow('2 hours');
  const create = async (db, options = {}) => {
    // we don't have a "create" function anymore, so we emulate it
    await db.fns.queue_worker_seen_with_last_date_active({
      task_queue_id_in: options.taskQueueId || 'prov/wt',
      worker_group_in: options.workerGroup || 'wg',
      worker_id_in: options.workerId || 'wi',
      expires_in: options.expires || expires,
    });
  };

  test('queue_workers', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    const queueDb = await helper.setupDb('queue');
    const wmDb = await helper.setupDb('worker_manager');

    for (let i = 0; i < 10; i++) {
      await create(queueDb, { taskQueueId: `prov/w/${i}`, workerId: `worker-${i}`, workerGroup: `wg-${i}` });
    }
    // create same worker with multiple queue ids
    const workerPoolIds = ['prov/w/1', 'some/other/pool', 'extra/pool'];
    await Promise.all(workerPoolIds.map((pool, idx) => wmDb.fns.create_worker(
      pool,
      `wg-${idx}`,
      'worker-1',
      'static',
      new Date(),
      new Date(),
      'state',
      { providerdata: true },
      1,
      new Date(),
      new Date(),
    )));

    await helper.upgradeTo(PREV_VERSION);
    const res = await queueDb.fns.get_queue_workers_with_wm_join('prov/w/1', null, null, null);
    // older implementation will include same worker that exists in `workers` table with two different `worker_pool_id`
    assert.equal(res.length, 3);

    await helper.upgradeTo(THIS_VERSION);
    const res2 = await queueDb.fns.get_queue_workers_with_wm_join('prov/w/1', null, null, null);
    // new implementation will include only workers with the same `worker_pool_id`
    assert.equal(res2.length, 1);
  });
});
