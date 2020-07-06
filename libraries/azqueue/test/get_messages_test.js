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

  test('get from empty queue', async function() {
    const queue = new AZQueue({ db: helper.db });

    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 1});

    assert.deepEqual(result, []);
  });

  test('get from one-item queue', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 2});

    assert.deepEqual(result.map(({messageText}) => messageText), ['bar-1']);
  });

  test('get marks items invisible', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });

    const result1 = await queue.getMessages('foo', {visibilityTimeout: 1, numberOfMessages: 2});
    assert.deepEqual(result1.map(({messageText}) => messageText), ['bar-1']);

    const result2 = await queue.getMessages('foo', {visibilityTimeout: 1, numberOfMessages: 2});
    assert.deepEqual(result2, []);

    // visibility granularity is in seconds, so we have to wait at least 1s
    await testing.sleep(1010);

    const result3 = await queue.getMessages('foo', {visibilityTimeout: 1, numberOfMessages: 2});
    assert.deepEqual(result3.map(({messageText}) => messageText), ['bar-1']);
  });

  test('get from multi-item queue', async function() {
    const queue = new AZQueue({ db: helper.db });

    // sleeps are long enough that the timestamps for these messages are different
    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    await testing.sleep(5);
    await queue.putMessage('foo', 'bar-2', { visibilityTimeout: 0, messageTTL: 100 });
    await testing.sleep(5);
    await queue.putMessage('foo', 'bar-3', { visibilityTimeout: 0, messageTTL: 100 });
    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 2});

    // note that the messages returned are not in order; we want to get 1 and 2, but it
    // doesn't matter which order
    assert.deepEqual(result.map(({messageText}) => messageText).sort(), ['bar-1', 'bar-2']);
  });

  test('get skips invisible items', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 10, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-2', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-3', { visibilityTimeout: 10, messageTTL: 100 });
    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 2});
    assert.deepEqual(result.map(({messageText}) => messageText).sort(), ['bar-2']);
  });

  test('get skips expired items', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 1 });
    await queue.putMessage('foo', 'bar-2', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-3', { visibilityTimeout: 0, messageTTL: 1 });

    // note that the TTL is in seconds, so we must wait..
    await testing.sleep(1100);

    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 2});
    assert.deepEqual(result.map(({messageText}) => messageText).sort(), ['bar-2']);
  });

  test('getting multiple items returns them in insertion order', async function() {
    const queue = new AZQueue({ db: helper.db });

    await queue.putMessage('foo', 'bar-1', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-2', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-3', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-4', { visibilityTimeout: 0, messageTTL: 100 });
    await queue.putMessage('foo', 'bar-5', { visibilityTimeout: 0, messageTTL: 100 });

    const result = await queue.getMessages('foo', {visibilityTimeout: 10, numberOfMessages: 4});
    assert.deepEqual(
      result.map(({messageText}) => messageText),
      ['bar-1', 'bar-2', 'bar-3', 'bar-4']);
  });

  test('multiple parallel gets', async function() {
    const queue = new AZQueue({ db: helper.db });

    for (let i = 0; i < 150; i++) {
      await queue.putMessage('q', `foo-${i}`, { visibilityTimeout: 0, messageTTL: 100 });
    }

    const got = [];
    await Promise.all(_.range(40).map(async () => {
      const result = await queue.getMessages('q', {visibilityTimeout: 10, numberOfMessages: 5});
      result.forEach(({messageText}) => got.push(messageText));
    }));

    // note that *crucially* this does not include any duplicates
    assert.deepEqual(got.sort(), _.range(150).map(i => `foo-${i}`).sort());
  });
});
