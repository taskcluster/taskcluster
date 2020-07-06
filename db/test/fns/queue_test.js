const assert = require('assert').strict;
const {fromNow} = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'queue' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from azure_queue_messages');
    });
  });

  helper.dbTest('count empty queue', async function(db) {
    const result = await db.fns.azure_queue_count("deps");
    assert.deepEqual(result, [{azure_queue_count: 0}]);
  });

  helper.dbTest('count queue containing messages', async function(db) {
    await db.fns.azure_queue_put("deps", "expired", fromNow('0 seconds'), fromNow('-10 seconds'));
    await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
    await db.fns.azure_queue_put("deps", "invisible", fromNow('10 seconds'), fromNow('10 seconds'));
    const result = await db.fns.azure_queue_count("deps");
    // expired message is not counted, leaving only invisible and visible
    assert.deepEqual(result, [{azure_queue_count: 2}]);
  });

  helper.dbTest('getting messages on an empty queue', async function(db) {
    const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result, []);
  });

  helper.dbTest('getting messages on a queue with invisible messages', async function(db) {
    await db.fns.azure_queue_put("deps", "invisible", fromNow('10 seconds'), fromNow('10 seconds'));
    const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result, []);
  });

  helper.dbTest('getting messages on a queue with visible messages', async function(db) {
    await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
    const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
    // check that message was marked invisible
    const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result2, []);
  });

  helper.dbTest('getting and deleting messages', async function(db) {
    await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
    const result = await db.fns.azure_queue_get("deps", fromNow('0 seconds'), 1);
    assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
    await db.fns.azure_queue_delete("deps", result[0].message_id, result[0].pop_receipt);
    const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result2, []);
  });

  helper.dbTest('making messages visible again', async function(db) {
    await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
    const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
    await db.fns.azure_queue_update("deps", "visible2", result[0].message_id, result[0].pop_receipt, fromNow('0 seconds'));
    const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
    assert.deepEqual(result2.map(({message_text}) => message_text), ['visible2']);
  });

  helper.dbTest('deleting expired messages', async function(db) {
    await db.fns.azure_queue_put("deps", "exp1", fromNow('0 seconds'), fromNow('0 seconds'));
    await db.fns.azure_queue_put("deps", "exp2", fromNow('10 seconds'), fromNow('0 seconds'));
    await db.fns.azure_queue_delete_expired();
    await helper.withDbClient(async client => {
      const res = await client.query('select count(*) from azure_queue_messages');
      assert.deepEqual(res.rows[0], {count: '0'});
    });
  });
});
