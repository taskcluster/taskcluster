const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  // note that this test suite initially tested the migration much more thoroughly, but did
  // so using tc-lib-entities, which has since been removed from the codebase.

  test('builds table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('taskcluster_github_builds_entities');
    await helper.assertNoTable('github_builds');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('taskcluster_github_builds_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('github_builds');
  });
});
