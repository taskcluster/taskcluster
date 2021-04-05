const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('object_hashes table created / dropped', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertNoTable('object_hashes');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('object_hashes');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('object_hashes');
  });
});
