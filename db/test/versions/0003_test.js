const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('azure_queue_messages table created', async function() {
    await helper.assertNoTable('azure_queue_messages');
    await helper.upgradeTo(3);
    await helper.assertTable('azure_queue_messages');
    await helper.downgradeTo(2);
    await helper.assertNoTable('azure_queue_messages');
  });
});
