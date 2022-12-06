const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('hooks last fires index added / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('hooks_last_fires');
    await helper.assertNoIndexOnColumn('hooks_last_fires', 'hooks_last_fires_time', 'task_create_time');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('hooks_last_fires');
    await helper.assertIndexOnColumn('hooks_last_fires', 'hooks_last_fires_time', 'task_create_time');
    await helper.assertNoTable('taskcluster_checks_to_tasks_entities');
    await helper.assertNoTable('taskcluster_check_runs_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('hooks_last_fires');
    await helper.assertNoIndexOnColumn('hooks_last_fires', 'hooks_last_fires_time', 'task_create_time');
  });
});
