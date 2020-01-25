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

  test('delete message after getting', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    const result1 = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 2});
    assert.deepEqual(result1.map(({messageText}) => messageText), ['bar-1']);

    await queue.updateMessage(
      'foo',
      'bar-1a',
      result1[0].messageId,
      result1[0].popReceipt,
      {visibilityTimeout: 0});

    // new visibility timeout is 0, so the message should be gettable again (with new text)
    const result2 = await queue.getMessages('foo', {visibilityTimeout: 0, numberOfMessages: 2});
    assert.deepEqual(result2.map(({messageText}) => messageText), ['bar-1a']);
  });
});
