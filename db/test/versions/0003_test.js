import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  helper.withDbForVersion();

  test('azure_queue_messages table created', async () => {
    await helper.assertNoTable('azure_queue_messages');
    await helper.upgradeTo(3);
    await helper.assertTable('azure_queue_messages');
    await helper.downgradeTo(2);
    await helper.assertNoTable('azure_queue_messages');
  });
});
