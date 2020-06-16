const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  const THIS_VERSION = 14;
  const PREV_VERSION = THIS_VERSION - 1;
  helper.withDbForVersion();

  const assertNoColumn = async columnName => {
    await helper.withDbClient(async client => {
      const columns = (
        await client.query(`select column_name from information_schema.columns where table_name = 'workers'`)
      ).rows.map(row => row.column_name);
      assert(!columns.includes(columnName));
    });
  };

  const assertColumn = async columnName => {
    await helper.withDbClient(async client => {
      const columns = (
        await client.query(`select column_name from information_schema.columns where table_name = 'workers'`)
      ).rows.map(row => row.column_name);
      assert(columns.includes(columnName));
    });
  };

  test('secret column added', async function() {
    await helper.upgradeTo(PREV_VERSION);
    await assertNoColumn('secret');
    await helper.upgradeTo(THIS_VERSION);
    await assertColumn('secret');
    await helper.downgradeTo(PREV_VERSION);
    await assertNoColumn('secret');
  });
});
