import helper from '../helper.js';
import testing from 'taskcluster-lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('queue_workers index added / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_workers');
    await helper.assertNoIndexOnColumn('queue_workers', 'idx_queue_workers_task_queue_id', 'task_queue_id');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_workers');
    await helper.assertIndexOnColumn('queue_workers', 'idx_queue_workers_task_queue_id', 'task_queue_id');
  });
});
