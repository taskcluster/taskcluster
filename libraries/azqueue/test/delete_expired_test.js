const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const AZQueue = require('taskcluster-lib-azqueue');
const path = require('path');
const assert = require('assert').strict;
const _ = require('lodash');

helper.dbSuite(path.basename(__filename), function() {
  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-azqueue';
  helper.withDb({ schema, serviceName, clearBeforeTests: true });

  test('expired messages are deleted in cleanup', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 0 });
    await queue.putMessage('foo', 'bar-2', { visibilityTimeout: 0, messageTTL: 0 });
    await queue.putMessage('foo', 'bar-3', { visibilityTimeout: 0, messageTTL: 10 });
    await queue.deleteExpiredMessages();

    // the un-expired message is still present..
    const result3 = await queue.getMessages('foo', {visibilityTimeout: 1, numberOfMessages: 2});
    assert.deepEqual(result3.map(({messageText}) => messageText), ['bar-3']);

    // and now verify that the expired messages are not even in the table
    await helper.db._withClient('read', async client => {
      const res = await client.query('select message_text from azure_queue_messages');
      assert.deepEqual(res.rows, [{message_text: 'bar-3'}]);
    });
  });
});
