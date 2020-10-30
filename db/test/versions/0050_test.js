const _ = require('lodash');
const helper = require('../helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  helper.dbVersionTest({
    version: THIS_VERSION,
    onlineMigration: false,
    onlineDowngrade: false,
    createData: async client => {
      await client.query(`
        with gen as (
          select generate_series(1, 99) as i
        )
        insert into cache_purges (provisioner_id, worker_type, cache_name, before, expires)
        select 
          'pp' as provisioner_id,
          'wt-' || gen.i as worker_type,
          'cc-' || gen.i as cache_name,
          now() as before,
          now() as expires
        from gen`);
    },
    startCheck: async client => {
      // check that the data is as we inserted it (even after migration+downgrade)
      const res = await client.query('select cache_name from cache_purges');
      const got = res.rows.map(({ cache_name }) => cache_name).sort();
      assert.deepEqual(got, _.range(1, 100).map(i => `cc-${i}`).sort());

      // and check the schema
      await helper.assertTableColumn('cache_purges', 'provisioner_id');
      await helper.assertTableColumn('cache_purges', 'worker_type');
      await helper.assertNoTableColumn('cache_purges', 'worker_pool_id');
    },
    concurrentCheck: async client => {
      // check that the existing all_purge_requests function still works
      const res = await client.query('select * from all_purge_requests(NULL, NULL)');
      const got = res.rows.map(({ cache_name, worker_type }) => `${cache_name} ${worker_type}`).sort();
      const exp = _.range(1, 100).map(i => `cc-${i} wt-${i}`).sort();
      assert.deepEqual(got, exp);
    },
    finishedCheck: async client => {
      // check that the new _wpid function works
      const res = await client.query('select * from all_purge_requests_wpid(NULL, NULL)');
      const got = res.rows.map(({ cache_name, worker_pool_id }) => `${cache_name} ${worker_pool_id}`).sort();
      const exp = _.range(1, 100).map(i => `cc-${i} pp/wt-${i}`).sort();
      assert.deepEqual(got, exp);

      // and check the schema
      await helper.assertNoTableColumn('cache_purges', 'provisioner_id');
      await helper.assertNoTableColumn('cache_purges', 'worker_type');
      await helper.assertTableColumn('cache_purges', 'worker_pool_id');
    },
  });
});
