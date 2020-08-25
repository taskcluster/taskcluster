const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('hooks_last_fires table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('last_fire_3_entities');
    await helper.assertNoTable('hooks_last_fires');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('last_fire_3_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('hooks_last_fires');
  });
});
