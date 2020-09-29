const helper = require('../helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('worker_pool_id, provisioner_id, worker_type columns created / removed appropriately', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });

    await helper.upgradeTo(PREV_VERSION);

    await helper.withDbClient(async client => {
      await client.query(`
        insert into cache_purges (provisioner_id, worker_type, cache_name, before, expires)
        values ('pp', 'wt', 'cc', now(), now())`);
    });

    await helper.assertNoTableColumn('cache_purges', 'worker_pool_id');
    await helper.assertTableColumn('cache_purges', 'provisioner_id');
    await helper.assertTableColumn('cache_purges', 'worker_type');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('cache_purges', 'worker_pool_id');
    await helper.assertNoTableColumn('cache_purges', 'worker_type');
    await helper.assertNoTableColumn('cache_purges', 'provisioner_id');

    await helper.withDbClient(async client => {
      const res = await client.query(`select worker_pool_id from cache_purges`);
      assert.equal(res.rows[0].worker_pool_id, 'pp/wt');
    });

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTableColumn('cache_purges', 'worker_pool_id');
    await helper.assertTableColumn('cache_purges', 'provisioner_id');
    await helper.assertTableColumn('cache_purges', 'worker_type');

    await helper.withDbClient(async client => {
      const res = await client.query(`select provisioner_id, worker_type from cache_purges`);
      assert.equal(res.rows[0].provisioner_id, 'pp');
      assert.equal(res.rows[0].worker_type, 'wt');
    });

  });
});
