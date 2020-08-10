const helper = require('./helper');
const AZQueue = require('taskcluster-lib-azqueue');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  test('createQueue', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.createQueue('foo');
  });

  test('deleteQueue', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.deleteQueue('foo');
  });

  test('setMetadata', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.setMetadata('foo', { someData: "bar" });
  });

  test('setMetadata', async function() {
    const queue = new AZQueue({ db: helper.db });
    await queue.setMetadata('foo', { someData: "bar" });
  });

  test('listQueues', async function() {
    const queue = new AZQueue({ db: helper.db });
    assert.deepEqual(await queue.listQueues(), { queues: [] });
  });
});
