const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('new tables are created', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertNoTable('queue_pending_tasks');
    await helper.assertNoTable('queue_claimed_tasks');
    await helper.assertNoTable('queue_resolved_tasks');
    await helper.assertNoTable('queue_task_deadlines');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_pending_tasks');
    await helper.assertTable('queue_claimed_tasks');
    await helper.assertTable('queue_resolved_tasks');
    await helper.assertTable('queue_task_deadlines');
  });
});
