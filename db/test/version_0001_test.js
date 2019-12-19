const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDb();

  test('secrets table created', async function() {
    await helper.upgradeDb(1);

    await helper.withDbClient(async client => {
      const res = await client.query('select * from secrets');
      assert.deepEqual(res.rows, []);
    });
  });
});
