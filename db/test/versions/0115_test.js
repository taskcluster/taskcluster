import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('indexes added and removed', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertNoIndexOnColumn('worker_pool_errors', 'idx_worker_pool_errors_pool_id_extra_code', 'worker_pool_id');
    await helper.assertNoIndexOnColumn('workers', 'idx_workers_pool_id_state_capacity', 'worker_pool_id');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertIndexOnColumn('worker_pool_errors', 'idx_worker_pool_errors_pool_id_extra_code', 'worker_pool_id');
    await helper.assertIndexOnColumn('workers', 'idx_workers_pool_id_state_capacity', 'worker_pool_id');
  });
});
