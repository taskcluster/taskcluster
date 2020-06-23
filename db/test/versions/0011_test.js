const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
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
