const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('widgets table created', async function() {
    await helper.withDbClient(async client => {
      await assert.rejects(
        () => client.query('select * from widgets'),
        err => err.code === UNDEFINED_TABLE);
    });

    await helper.upgradeTo(1);

    await helper.withDbClient(async client => {
      const res = await client.query('select * from widgets');
      assert.deepEqual(res.rows, []);
    });
  });
});
