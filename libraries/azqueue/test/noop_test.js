const helper = require('./helper');
const { Schema } = require('taskcluster-lib-postgres');
const AZQueue = require('taskcluster-lib-azqueue');
const path = require('path');
const assert = require('assert').strict;

helper.dbSuite(path.basename(__filename), function() {
  const schema = Schema.fromDbDirectory(path.join(__dirname, 'db'));
  const serviceName = 'test-azqueue';
  let db;

  suiteSetup(async function() {
    db = await helper.withDb({ schema, serviceName });
  });

  suiteTeardown(async function() {
    if (db) {
      try {
        await db.close();
      } finally {
        db = null;
      }
    }
  });

  test('createQueue', async function() {
    const queue = new AZQueue({ db });
    await queue.createQueue('foo');
  });

  test('deleteQueue', async function() {
    const queue = new AZQueue({ db });
    await queue.deleteQueue('foo');
  });

  test('setMetadata', async function() {
    const queue = new AZQueue({ db });
    await queue.setMetadata('foo', {someData: "bar"});
  });

  test('setMetadata', async function() {
    const queue = new AZQueue({ db });
    await queue.setMetadata('foo', {someData: "bar"});
  });

  test('listQueues', async function() {
    const queue = new AZQueue({ db });
    assert.deepEqual(await queue.listQueues(), {queues: []});
  });
});
