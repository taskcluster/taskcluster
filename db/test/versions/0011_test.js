const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  const THIS_VERSION = 11;
  const PREV_VERSION = THIS_VERSION - 1;
  helper.withDbForVersion();

  test('widgets table dropped', async function() {
    await helper.upgradeTo(PREV_VERSION);
    await helper.assertTable("widgets");
    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable("widgets");
    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable("widgets");
  });
});
