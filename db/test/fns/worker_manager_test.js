const _ = require('lodash');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'worker_manager' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from worker_pools');
    });
    helper.fakeDb.worker_manager.reset();
  });

  // worker-manager entities functions are tested by entities_test.js and by the worker-manager service tests

  const create_worker_pool = async (db, wp = {}) => {
    await db.fns.create_worker_pool(
      wp.worker_pool_id || 'wp/id',
      wp.provider_id || 'provider',
      wp.previous_provider_ids || '[]', // N.B. JSON-encoded
      wp.description || 'descr',
      wp.config || {config: true},
      wp.created || new Date(),
      wp.last_modified || new Date(),
      wp.owner || 'me@me.com',
      wp.email_on_error || false,
      wp.provider_data || {providerdata: true},
    );
  };
  const update_worker_pool = async (db, wp = {}) => {
    return await db.fns.update_worker_pool(
      wp.worker_pool_id || 'wp/id',
      wp.provider_id || 'provider',
      wp.description || 'descr',
      wp.config || {config: true},
      wp.last_modified || new Date(),
      wp.owner || 'me@me.com',
      wp.email_on_error || false,
    );
  };

  helper.dbTest('create_worker_pool/get_worker_pool', async function(db, isFake) {
    const now = new Date();
    await create_worker_pool(db, {created: now, last_modified: now});

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.equal(rows[0].worker_pool_id, 'wp/id');
    assert.equal(rows[0].provider_id, 'provider');
    assert.deepEqual(rows[0].previous_provider_ids, []);
    assert.equal(rows[0].description, 'descr');
    assert.deepEqual(rows[0].config, {config: true});
    assert.deepEqual(rows[0].created, now);
    assert.deepEqual(rows[0].last_modified, now);
    assert.equal(rows[0].owner, 'me@me.com');
    assert.equal(rows[0].email_on_error, false);
    assert.deepEqual(rows[0].provider_data, {providerdata: true});
  });

  helper.dbTest('get_worker_pool not found', async function(db, isFake) {
    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows, []);
  });

  helper.dbTest('get_worker_pools empty', async function(db, isFake) {
    const rows = await db.fns.get_worker_pools(null, null);
    assert.deepEqual(rows, []);
  });

  helper.dbTest('get_worker_pools full, pagination', async function(db, isFake) {
    for (let i = 0; i < 10; i++) {
      await create_worker_pool(db, {worker_pool_id: `wp/${i}`});
    }

    let rows = await db.fns.get_worker_pools(null, null);
    assert.deepEqual(rows.map(r => r.worker_pool_id), _.range(10).map(i => `wp/${i}`));
    assert.equal(rows[0].provider_id, 'provider');
    assert.deepEqual(rows[0].previous_provider_ids, []);
    assert.equal(rows[0].description, 'descr');
    assert.deepEqual(rows[0].config, {config: true});
    assert.equal(rows[0].owner, 'me@me.com');
    assert.equal(rows[0].email_on_error, false);
    assert.deepEqual(rows[0].provider_data, {providerdata: true});

    rows = await db.fns.get_worker_pools(2, 4);
    assert.deepEqual(rows.map(r => r.worker_pool_id), [4, 5].map(i => `wp/${i}`));
  });

  helper.dbTest('update_worker_pool, no change to providerId', async function(db, isFake) {
    await create_worker_pool(db);

    const now = new Date();
    const upd = await update_worker_pool(db, {
      description: 'descr2',
      config: {config: 2},
      last_modified: now,
      owner: 'you@me.com',
      email_on_error: true,
    });
    assert.equal(upd[0].worker_pool_id, 'wp/id');
    assert.equal(upd[0].provider_id, 'provider');
    assert.equal(upd[0].description, 'descr2');
    assert.deepEqual(upd[0].config, {config: 2});
    assert.deepEqual(upd[0].last_modified, now);
    assert.equal(upd[0].owner, 'you@me.com');
    assert.equal(upd[0].email_on_error, true);
    assert.deepEqual(upd[0].previous_provider_id, 'provider');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.equal(rows[0].worker_pool_id, 'wp/id');
    assert.equal(rows[0].provider_id, 'provider');
    assert.deepEqual(rows[0].previous_provider_ids, []);
    assert.equal(rows[0].description, 'descr2');
    assert.deepEqual(rows[0].config, {config: 2});
    assert.deepEqual(rows[0].last_modified, now);
    assert.equal(rows[0].owner, 'you@me.com');
    assert.equal(rows[0].email_on_error, true);
    assert.deepEqual(rows[0].provider_data, {providerdata: true});
  });

  helper.dbTest('update_worker_pool, change to providerId', async function(db, isFake) {
    await create_worker_pool(db);
    const upd = await update_worker_pool(db, {provider_id: 'provider2'});
    assert.deepEqual(upd[0].previous_provider_id, 'provider');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
  });

  helper.dbTest('update_worker_pool, change to providerId, new provider already in previous', async function(db, isFake) {
    await create_worker_pool(db, {previous_provider_ids: JSON.stringify(['provider2'])});
    const upd = await update_worker_pool(db, {provider_id: 'provider2'});
    assert.deepEqual(upd[0].previous_provider_id, 'provider');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
  });

  helper.dbTest('update_worker_pool, change to providerId, old provider already in previous', async function(db, isFake) {
    await create_worker_pool(db, {previous_provider_ids: JSON.stringify(['provider'])});
    const upd = await update_worker_pool(db, {provider_id: 'provider2'});
    assert.deepEqual(upd[0].previous_provider_id, 'provider');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
  });

  helper.dbTest('expire_worker_pool', async function(db, isFake) {
    await create_worker_pool(db, {
      worker_pool_id: 'done',
      provider_id: 'null-provider',
      previous_provider_ids: JSON.stringify([]),
    });
    await create_worker_pool(db, {
      worker_pool_id: 'still-running',
      provider_id: 'azure',
      previous_provider_ids: JSON.stringify([]),
    });
    await create_worker_pool(db, {
      worker_pool_id: 'hanger-on',
      provider_id: 'null-provider',
      previous_provider_ids: JSON.stringify(['google']),
    });

    const rows = await db.fns.expire_worker_pools();
    assert.deepEqual(rows.map(r => r.worker_pool_id), ['done']);
  });

  helper.dbTest('delete_worker_pool', async function(db, isFake) {
    await create_worker_pool(db);

    await db.fns.delete_worker_pool('wp/id');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows, []);
  });

  helper.dbTest('remove_worker_pool_previous_provider_id', async function(db, isFake) {
    await create_worker_pool(db, {previous_provider_ids: JSON.stringify(['old1', 'old2'])});

    await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].previous_provider_ids, ['old2']);
  });

  helper.dbTest('remove_worker_pool_previous_provider_id, no worker-pool', async function(db, isFake) {
    await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows, []);
  });

  helper.dbTest('remove_worker_pool_previous_provider_id, no such provider', async function(db, isFake) {
    await create_worker_pool(db, {previous_provider_ids: JSON.stringify(['old1', 'old2'])});

    await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'unknown');

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].previous_provider_ids, ['old1', 'old2']);
  });

  helper.dbTest('update_worker_pool_provider_data', async function(db, isFake) {
    await create_worker_pool(db, {provider_data: {someprov: {somedata: true}}});

    await db.fns.update_worker_pool_provider_data('wp/id', 'another', {moredata: true});

    const rows = await db.fns.get_worker_pool('wp/id');
    assert.deepEqual(rows[0].provider_data, {
      someprov: {somedata: true},
      another: {moredata: true},
    });
  });
});
