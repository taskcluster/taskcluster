const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('access_tokens table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('access_token_table_entities');
    await helper.assertNoTable('access_tokens');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('access_tokens');
    await helper.assertNoTable('access_token_table_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('access_token_table_entities');
    await helper.assertNoTable('access_tokens');
  });
});
