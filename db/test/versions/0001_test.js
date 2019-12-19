const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('secrets table created', async function() {
    await helper.upgradeTo(1);

    await helper.withDbClient(async client => {
      const res = await client.query('select * from secrets');
      assert.deepEqual(res.rows, []);
    });
  });
});
