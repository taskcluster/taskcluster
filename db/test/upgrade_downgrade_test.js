const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const tcdb = require('taskcluster-db');
const helper = require('./helper');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  const schema = tcdb.schema({ useDbDirectory: true });
  const latestVersion = schema.latestVersion();

  // upgrade and downgrade *twice*, to detect any issues where the downgrade leaves
  // resources in place that later conflict with the upgrade.  Note that these tests
  // are inter-dependent.

  const assertEmptySchema = async () => {
    await helper.withDbClient(async client => {
      const tables = await client.query(`
        select * from pg_catalog.pg_tables
        where schemaname = 'public'
        and tablename != 'tcversion'
      `);
      assert.deepEqual(tables.rows, []);

      const sequences = await client.query(`
        select * from pg_catalog.pg_sequences
        where schemaname = 'public'
      `);
      assert.deepEqual(sequences.rows, []);

      const indexes = await client.query(`
        select * from pg_catalog.pg_indexes
        where schemaname = 'public'
      `);
      assert.deepEqual(indexes.rows, []);

      // note that stored functions might remain -- that's expected
    });
  };

  const assertNoPermissions = async () => {
    await helper.withDbClient(async client => {
      const res = await client.query(`
        select grantee, table_name, privilege_type
          from information_schema.table_privileges
          where table_schema = 'public'
           and grantee like $1 || '\\_%'
           and table_catalog = current_catalog
           and table_name != 'tcversion'
        union
        select grantee, table_name, privilege_type
          from information_schema.column_privileges
          where table_schema = 'public'
           and grantee like $1 || '\\_%'
           and table_catalog = current_catalog
           and table_name != 'tcversion'`, ['test']);
      assert.deepEqual(res.rows, []);
    });
  };

  test('upgrade to latest version', async function() {
    await helper.upgradeTo(latestVersion.version);
  });

  test('downgrade to version 0', async function() {
    await helper.downgradeTo(0);
    await assertEmptySchema();
    await assertNoPermissions();
  });

  test('upgrade to latest version again', async function() {
    await helper.upgradeTo(latestVersion.version);
  });

  test('downgrade to version 0', async function() {
    await helper.downgradeTo(0);
    await assertEmptySchema();
    await assertNoPermissions();
  });
});
