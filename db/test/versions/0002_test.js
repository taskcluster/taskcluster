const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {postgresTableName} = require('taskcluster-lib-entities');
const {UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();
  const assertNoTable = async table => {
    await helper.withDbClient(async client => {
      await assert.rejects(
        () => client.query(`select * from ${table}`),
        err => err.code === UNDEFINED_TABLE);
    });
  };

  const assertTable = async table => {
    await helper.withDbClient(async client => {
      const res = await client.query(`select * from ${table}`);
      assert.deepEqual(res.rows, []);
    });
  };

  /* Note that these tests run in order */

  test(`tables created on upgrade`, async function () {
    await helper.upgradeTo(1);

    for (let azureTableName of helper.azureTableNames) {
      await assertNoTable(postgresTableName(azureTableName));
    }

    await helper.upgradeTo(2);

    for (let azureTableName of helper.azureTableNames) {
      await assertTable(postgresTableName(azureTableName));
    }
  });

  test(`tables dropped on downgrade`, async function () {
    await helper.downgradeTo(1);
    for (let azureTableName of helper.azureTableNames) {
      await assertNoTable(postgresTableName(azureTableName));
    }
  });
});
