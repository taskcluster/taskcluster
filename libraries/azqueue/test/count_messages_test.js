const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const AZQueue = require('taskcluster-lib-azqueue');
const path = require('path');
const assert = require('assert').strict;

helper.dbSuite(path.basename(__filename), function() {
  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-azqueue';
  helper.withDb({ schema, serviceName, clearBeforeTests: true });

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

  test('count queue with many messages in several queues', async function() {
    const queue = new AZQueue({ db: helper.db });
    for (let i = 0; i < 100; i++) {
      await queue.putMessage('queue-1-ABC', 'foo', { visibilityTimeout: (i % 2) ? 0 : 20, messageTTL: 100 });
      await queue.putMessage('queue-1-DEF', 'bar', { visibilityTimeout: (i % 3) ? 0 : 20, messageTTL: 100 });
    }
    assert.deepEqual(await queue.getMetadata('queue-1-ABC'), {messageCount: 100});
    assert.deepEqual(await queue.getMetadata('queue-1-DEF'), {messageCount: 100});
  });
});
