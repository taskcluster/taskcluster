import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('azure_queue_messages define extra fields for upcoming migration', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('azure_queue_messages');
    await helper.assertNoTableColumn('azure_queue_messages', 'task_queue_id');
    await helper.assertNoTableColumn('azure_queue_messages', 'priority');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('azure_queue_messages');
    await helper.assertTableColumn('azure_queue_messages', 'task_queue_id');
    await helper.assertTableColumn('azure_queue_messages', 'priority');
  });
});
