const helper = require('./helper');
const AZQueue = require('taskcluster-lib-azqueue');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const _ = require('lodash');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  setup('clear queue', async function() {
    if (skipping()) {
      return;
    }

    await helper.db._withClient('write', async client => {
      client.query('delete from azure_queue_messages');
    });
  });

  test('update message after getting', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    const result1 = await queue.getMessages('foo', { visibilityTimeout: 10, numberOfMessages: 2 });
    assert.deepEqual(result1.map(({ messageText }) => messageText), ['bar-1']);

    await queue.updateMessage(
      'foo',
      'bar-1a',
      result1[0].messageId,
      result1[0].popReceipt,
      { visibilityTimeout: 0 });

    // new visibility timeout is 0, so the message should be gettable again (with new text)
    const result2 = await queue.getMessages('foo', { visibilityTimeout: 0, numberOfMessages: 2 });
    assert.deepEqual(result2.map(({ messageText }) => messageText), ['bar-1a']);
  });
});
