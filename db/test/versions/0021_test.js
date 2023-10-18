import _ from 'lodash';
import helper from '../helper.js';
import testing from 'taskcluster-lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  // note that this test suite initially tested the migration much more thoroughly, but did
  // so using tc-lib-entities, which has since been removed from the codebase.

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_task_groups_entities');
    await helper.assertNoTable('task_groups');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('queue_task_groups_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queue_task_groups_entities');
    await helper.assertNoTable('task_groups');
  });
});
