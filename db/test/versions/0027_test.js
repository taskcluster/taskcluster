const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// Since we don't migrate data from previous version, no need for tests for
// validating data migration.

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('github_access_tokens table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('github_access_token_table_entities');
    await helper.assertNoTable('github_access_tokens');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('github_access_tokens');
    await helper.assertNoTable('github_access_token_table_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('github_access_token_table_entities');
    await helper.assertNoTable('github_access_tokens');
  });
});
