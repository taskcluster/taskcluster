const helper = require('../helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('task_queue_id, provisioner_id, worker_type columns created / removed appropriately and table named changed correctly for queue_worker_types -> task_queues', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });

    await helper.upgradeTo(PREV_VERSION);

    await helper.withDbClient(async client => {
      await client.query(`
        insert into queue_worker_types (provisioner_id, worker_type, description, stability, expires, last_date_active)
        values ('pp', 'wt', 'desc', 'st', now(), now())`);
    });

    await helper.assertNoTableColumn('queue_worker_types', 'task_queue_id');
    await helper.assertTableColumn('queue_worker_types', 'provisioner_id');
    await helper.assertTableColumn('queue_worker_types', 'worker_type');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('task_queues', 'task_queue_id');
    await helper.assertNoTableColumn('task_queues', 'worker_type');
    await helper.assertNoTableColumn('task_queues', 'provisioner_id');

    await helper.withDbClient(async client => {
      const res = await client.query(`select task_queue_id from task_queues`);
      assert.equal(res.rows[0].task_queue_id, 'pp/wt');
    });

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTableColumn('queue_worker_types', 'task_queue_id');
    await helper.assertTableColumn('queue_worker_types', 'provisioner_id');
    await helper.assertTableColumn('queue_worker_types', 'worker_type');

    await helper.withDbClient(async client => {
      const res = await client.query(`select provisioner_id, worker_type from queue_worker_types`);
      assert.equal(res.rows[0].provisioner_id, 'pp');
      assert.equal(res.rows[0].worker_type, 'wt');
    });
    
  });
    test('task_queue_id, provisioner_id, worker_type columns created / removed appropriately for queue_workers', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });

    await helper.upgradeTo(PREV_VERSION);

    await helper.withDbClient(async client => {
      await client.query(`
        insert into queue_workers (provisioner_id, worker_type, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim)
        values ('pp', 'wt', 'wg', 'wid', json_object('{}'), now(), now(), now())`);
    });

    await helper.assertNoTableColumn('queue_workers', 'task_queue_id');
    await helper.assertTableColumn('queue_workers', 'provisioner_id');
    await helper.assertTableColumn('queue_workers', 'worker_type');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('queue_workers', 'task_queue_id');
    await helper.assertNoTableColumn('queue_workers', 'worker_type');
    await helper.assertNoTableColumn('queue_workers', 'provisioner_id');

    await helper.withDbClient(async client => {
      const res = await client.query(`select task_queue_id from queue_workers`);
      assert.equal(res.rows[0].task_queue_id, 'pp/wt');
    });

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTableColumn('queue_workers', 'task_queue_id');
    await helper.assertTableColumn('queue_workers', 'provisioner_id');
    await helper.assertTableColumn('queue_workers', 'worker_type');

    await helper.withDbClient(async client => {
      const res = await client.query(`select provisioner_id, worker_type from queue_workers`);
      assert.equal(res.rows[0].provisioner_id, 'pp');
      assert.equal(res.rows[0].worker_type, 'wt');
    });
    
  });
});
