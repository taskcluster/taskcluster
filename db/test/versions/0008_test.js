const testing = require('taskcluster-lib-testing');
const helper = require('../helper');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('cache_purges table created', async function() {
    await helper.assertNoTable('cache_purges');
    await helper.upgradeTo(8);
    await helper.assertTable('cache_purges');
    await helper.downgradeTo(7);
    await helper.assertNoTable('cache_purges');
  });
});
