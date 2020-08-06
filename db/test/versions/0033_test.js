const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('hooks_queues table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queues_entities');
    await helper.assertNoTable('hooks_queues');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('hooks_queues');
    await helper.assertNoTable('queues_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queues_entities');
    await helper.assertNoTable('hooks_queues');
  });
});
