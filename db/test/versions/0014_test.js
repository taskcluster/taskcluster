const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
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
