const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  // note that this test suite initially tested the migration much more thoroughly, but did
  // so using tc-lib-entities, which has since been removed from the codebase.

  test('worker_pool_errors table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('wmworker_pool_errors_entities');
    await helper.assertNoTable('worker_pool_errors');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('wmworker_pool_errors_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('worker_pool_errors');
  });
});
