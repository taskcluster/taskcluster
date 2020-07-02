const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const AZQueue = require('taskcluster-lib-azqueue');
const assert = require('assert').strict;

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

  test('count empty queue', async function() {
    const queue = new AZQueue({ db: helper.db });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 0);
  });

  test('count queue with visible messages', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.putMessage('foo', 'bar', { visibilityTimeout: 0, messageTTL: 100 });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 1);
  });

  test('count queue with invisible messages', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.putMessage('foo', 'bar', { visibilityTimeout: 50, messageTTL: 100 });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 1);
  });

  test('count queue with expired messages', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.putMessage('foo', 'exp', { visibilityTimeout: 50, messageTTL: -20 });
    await queue.putMessage('foo', 'exp', { visibilityTimeout: 50, messageTTL: -10 });
    await queue.putMessage('foo', 'viz', { visibilityTimeout: 50, messageTTL: 100 });
    await queue.putMessage('foo', 'viz', { visibilityTimeout: 50, messageTTL: 110 });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 2);
  });

  test('count many messages in several queues', async function() {
    const queue = new AZQueue({ db: helper.db });
    for (let i = 0; i < 100; i++) {
      await queue.putMessage('queue-1-ABC', 'foo', { visibilityTimeout: (i % 2) ? 0 : 20, messageTTL: 100 });
      await queue.putMessage('queue-1-DEF', 'bar', { visibilityTimeout: (i % 3) ? 0 : 20, messageTTL: 100 });
    }
    assert.deepEqual(await queue.getMetadata('queue-1-ABC'), {messageCount: 100});
    assert.deepEqual(await queue.getMetadata('queue-1-DEF'), {messageCount: 100});
  });
});
