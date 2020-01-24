const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const AZQueue = require('taskcluster-lib-azqueue');
const path = require('path');
const assert = require('assert').strict;

helper.dbSuite(path.basename(__filename), function() {
  let db;

  teardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-azqueue';

  test('count empty queue', async function() {
    db = await helper.withDb({ schema, serviceName });

    const queue = new AZQueue({ db });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 0);
  });

  test('count queue with visible messages', async function() {
    db = await helper.withDb({ schema, serviceName });

    const queue = new AZQueue({ db });
    await queue.putMessage('foo', 'bar', { visibilityTimeout: 0, messageTTL: 100 });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 1);
  });

  test('count queue with invisible messages', async function() {
    db = await helper.withDb({ schema, serviceName });

    const queue = new AZQueue({ db });
    await queue.putMessage('foo', 'bar', { visibilityTimeout: 50, messageTTL: 100 });
    const result = await queue.getMetadata('foo');

    assert.equal(result.messageCount, 1);
  });

  test('count queue with many messages in several queues', async function() {
    db = await helper.withDb({ schema, serviceName });

    const queue = new AZQueue({ db });
    for (let i = 0; i < 100; i++) {
      await queue.putMessage('queue-1-ABC', 'foo', { visibilityTimeout: (i % 2) ? 0 : 20, messageTTL: 100 });
      await queue.putMessage('queue-1-DEF', 'bar', { visibilityTimeout: (i % 3) ? 0 : 20, messageTTL: 100 });
    }
    assert.deepEqual(await queue.getMetadata('queue-1-ABC'), {messageCount: 100});
    assert.deepEqual(await queue.getMetadata('queue-1-DEF'), {messageCount: 100});
  });
});
