const _ = require('lodash');
const slug = require('slugid');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'worker_manager' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from worker_pools');
      await client.query('delete from worker_pool_errors');
      await client.query('delete from workers');
      await client.query('delete from queue_workers');
    });
  });

  // worker-manager entities functions are tested by entities_test.js and by the worker-manager service tests

  const create_worker_pool = async (db, wp = {}) => {
    await db.fns.create_worker_pool(
      wp.worker_pool_id || 'wp/id',
      wp.provider_id || 'provider',
      wp.previous_provider_ids || '[]', // N.B. JSON-encoded
      wp.description || 'descr',
      wp.config || { config: true },
      wp.created || new Date(),
      wp.last_modified || new Date(),
      wp.owner || 'me@me.com',
      wp.email_on_error || false,
      wp.provider_data || { providerdata: true },
    );
  };
  const update_worker_pool = async (db, wp = {}) => {
    const input = [
      wp.worker_pool_id || 'wp/id',
      wp.provider_id || 'provider',
      wp.description || 'descr',
      wp.config || { config: true },
      wp.last_modified || new Date(),
      wp.owner || 'me@me.com',
      wp.email_on_error || false,
    ];
    const with_cap = await db.fns.update_worker_pool_with_capacity_and_counts_by_state(...input);
    for (const wp of with_cap) {
      assert(wp.requested_count === 0);
      assert(wp.running_count === 0);
      assert(wp.stopping_count === 0);
      assert(wp.stopped_count === 0);
      assert(wp.requested_capacity === 0);
      assert(wp.running_capacity === 0);
      assert(wp.stopping_capacity === 0);
      assert(wp.stopped_capacity === 0);
      delete wp.requested_count;
      delete wp.running_count;
      delete wp.stopping_count;
      delete wp.stopped_count;
      delete wp.requested_capacity;
      delete wp.running_capacity;
      delete wp.stopping_capacity;
      delete wp.stopped_capacity;
    }
    const old = await db.deprecatedFns.update_worker_pool_with_capacity(...input);
    // We override previous_provider_id in this comparison because a side-effect
    // of calling this function is updating that value so we can't compare here
    assert.deepEqual({ ...with_cap[0], previous_provider_id: '' }, { ...old[0], previous_provider_id: '' });
    return with_cap;
  };
  const create_worker_pool_error = async (db, e = {}) => {
    await db.fns.create_worker_pool_error(
      e.error_id || 'e/id',
      e.worker_pool_id || 'wp/id',
      e.reported || new Date(),
      e.kind || 'kind',
      e.title || 'title',
      e.description || 'descr',
      e.extra || { extra: true },
    );
  };
  const create_worker = async (db, w = {}) => {
    return (await db.fns.create_worker(
      w.worker_pool_id || 'wp/id',
      w.worker_group || 'w/group',
      w.worker_id || 'w/id',
      w.provider_id || 'provider',
      w.created || new Date(),
      w.expires || new Date(),
      w.state || 'state',
      w.provider_data || { providerdata: true },
      w.capacity || 1,
      w.last_modified || new Date(),
      w.last_checked || new Date(),
    ))[0].create_worker;
  };
  const update_worker = async (db, w = {}, etag) => {
    return await db.deprecatedFns.update_worker(
      w.worker_pool_id || 'wp/id',
      w.worker_group || 'w/group',
      w.worker_id || 'w/id',
      w.provider_id || 'provider',
      w.created || new Date(),
      w.expires || new Date(),
      w.state || 'state',
      w.provider_data || { providerdata: true },
      w.capacity || 1,
      w.last_modified || new Date(),
      w.last_checked || new Date(),
      etag,
    );
  };
  const update_worker_2 = async (db, w = {}, etag) => {
    return await db.fns.update_worker_2(
      w.worker_pool_id || 'wp/id',
      w.worker_group || 'w/group',
      w.worker_id || 'w/id',
      w.provider_id || 'provider',
      w.created || new Date(),
      w.expires || new Date(),
      w.state || 'state',
      w.provider_data || { providerdata: true },
      w.capacity || 1,
      w.last_modified || new Date(),
      w.last_checked || new Date(),
      etag,
      w.secret || null,
    );
  };

  const get_worker_pool = async (db, worker_pool_id) => {
    const with_cap = await db.fns.get_worker_pool_with_capacity_and_counts_by_state(worker_pool_id);
    for (const wp of with_cap) {
      assert(wp.requested_count === 0);
      assert(wp.running_count === 0);
      assert(wp.stopping_count === 0);
      assert(wp.stopped_count === 0);
      assert(wp.requested_capacity === 0);
      assert(wp.running_capacity === 0);
      assert(wp.stopping_capacity === 0);
      assert(wp.stopped_capacity === 0);
      delete wp.requested_count;
      delete wp.running_count;
      delete wp.stopping_count;
      delete wp.stopped_count;
      delete wp.requested_capacity;
      delete wp.running_capacity;
      delete wp.stopping_capacity;
      delete wp.stopped_capacity;
    }
    const old = await db.deprecatedFns.get_worker_pool_with_capacity(worker_pool_id);
    assert.deepEqual(with_cap, old);
    return with_cap;
  };

  const get_worker_pools = async (db, page_size, page_offset) => {
    const with_cap = await db.fns.get_worker_pools_with_capacity_and_counts_by_state(page_size, page_offset);
    for (const wp of with_cap) {
      assert(wp.requested_count === 0);
      assert(wp.running_count === 0);
      assert(wp.stopping_count === 0);
      assert(wp.stopped_count === 0);
      assert(wp.requested_capacity === 0);
      assert(wp.running_capacity === 0);
      assert(wp.stopping_capacity === 0);
      assert(wp.stopped_capacity === 0);
      delete wp.requested_count;
      delete wp.running_count;
      delete wp.stopping_count;
      delete wp.stopped_count;
      delete wp.requested_capacity;
      delete wp.running_capacity;
      delete wp.stopping_capacity;
      delete wp.stopped_capacity;
    }
    const old = await db.deprecatedFns.get_worker_pools_with_capacity(page_size, page_offset);
    assert.deepEqual(with_cap, old);
    return with_cap;
  };

  suite(`${testing.suiteName()} - worker_pools`, function() {
    helper.dbTest('create_worker_pool/get_worker_pool', async function(db) {
      const now = new Date();
      await create_worker_pool(db, { created: now, last_modified: now });

      const rows = await get_worker_pool(db, 'wp/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.deepEqual(rows[0].previous_provider_ids, []);
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].config, { config: true });
      assert.deepEqual(rows[0].created, now);
      assert.deepEqual(rows[0].last_modified, now);
      assert.equal(rows[0].owner, 'me@me.com');
      assert.equal(rows[0].email_on_error, false);
      assert.deepEqual(rows[0].provider_data, { providerdata: true });
    });

    helper.dbTest('get_worker_pool not found', async function(db) {
      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pools empty', async function(db) {
      const rows = await get_worker_pools(db, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pools full, pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create_worker_pool(db, { worker_pool_id: `wp/${i}` });
      }

      let rows = await get_worker_pools(db, null, null);
      assert.deepEqual(rows.map(r => r.worker_pool_id), _.range(10).map(i => `wp/${i}`));
      assert.equal(rows[0].provider_id, 'provider');
      assert.deepEqual(rows[0].previous_provider_ids, []);
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].config, { config: true });
      assert.equal(rows[0].owner, 'me@me.com');
      assert.equal(rows[0].email_on_error, false);
      assert.deepEqual(rows[0].provider_data, { providerdata: true });

      rows = await get_worker_pools(db, 2, 4);
      assert.deepEqual(rows.map(r => r.worker_pool_id), [4, 5].map(i => `wp/${i}`));
    });

    helper.dbTest('update_worker_pool, change to providerId', async function(db) {
      await create_worker_pool(db);
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('update_worker_pool, change to providerId, new provider already in previous', async function(db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['provider2']) });
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('update_worker_pool, change to providerId, old provider already in previous', async function(db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['provider']) });
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('expire_worker_pool', async function(db) {
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

    helper.dbTest('delete_worker_pool', async function(db) {
      await create_worker_pool(db);

      await db.fns.delete_worker_pool('wp/id');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id', async function(db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['old1', 'old2']) });

      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['old2']);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id, no worker-pool', async function(db) {
      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id, no such provider', async function(db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['old1', 'old2']) });

      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'unknown');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['old1', 'old2']);
    });

    helper.dbTest('update_worker_pool_provider_data', async function(db) {
      await create_worker_pool(db, { provider_data: { someprov: { somedata: true } } });

      await db.fns.update_worker_pool_provider_data('wp/id', 'another', { moredata: true });

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].provider_data, {
        someprov: { somedata: true },
        another: { moredata: true },
      });
    });
  });

  suite(`${testing.suiteName()} - worker_pool_errors`, function() {
    helper.dbTest('create_worker_pool_error/get_worker_pool_error', async function(db, isFake) {
      const now = new Date();
      await create_worker_pool_error(db, { reported: now });
      const rows = await db.fns.get_worker_pool_error('e/id', 'wp/id');
      assert.equal(rows[0].error_id, 'e/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.deepEqual(rows[0].reported, now);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].extra, { extra: true });
    });

    helper.dbTest('get_worker_pool_error not found', async function(db, isFake) {
      const rows = await db.fns.get_worker_pool_error('e/id', 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool empty', async function(db, isFake) {
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool(null, null, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool empty query', async function(db, isFake) {
      const now = new Date();
      await create_worker_pool_error(db, { reported: now });
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool(null, null, null, null);
      assert.equal(rows[0].error_id, 'e/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.deepEqual(rows[0].reported, now);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].extra, { extra: true });
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool full, pagination', async function(db, isFake) {
      let newestDate;
      for (let i = 9; i >= 0; i--) {
        newestDate = fromNow(`- ${i} days`);
        await create_worker_pool_error(db, {
          error_id: `e/${i}`,
          worker_pool_id: `wp/${i}`,
          reported: newestDate,
        });
      }

      let rows = await db.fns.get_worker_pool_errors_for_worker_pool(null, null, null, null);
      assert.deepEqual(
        rows.map(r => ({ error_id: r.error_id, worker_pool_id: r.worker_pool_id })),
        _.range(10).map(i => ({ error_id: `e/${i}`, worker_pool_id: `wp/${i}` })));
      assert.deepEqual(rows[0].reported, newestDate);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].extra, { extra: true });

      rows = await db.fns.get_worker_pool_errors_for_worker_pool(null, null, 2, 4);
      assert.deepEqual(
        rows.map(r => ({ error_id: r.error_id, worker_pool_id: r.worker_pool_id })),
        [4, 5].map(i => ({ error_id: `e/${i}`, worker_pool_id: `wp/${i}` })));
    });

    helper.dbTest('expire_worker_pool_errors', async function(db, isFake) {
      await create_worker_pool_error(db, { error_id: 'done', reported: fromNow('- 1 day') });
      await create_worker_pool_error(db, { error_id: 'also-done', reported: fromNow('- 2 days') });
      await create_worker_pool_error(db, { error_id: 'still-running', reported: fromNow('1 day') });

      const count = (await db.fns.expire_worker_pool_errors(fromNow()))[0].expire_worker_pool_errors;
      assert.equal(count, 2);
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool(null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('delete_worker_pool_errors', async function(db, isFake) {
      await create_worker_pool_error(db);

      await db.fns.delete_worker_pool_error('e/id', 'wp/id');

      const rows = await db.fns.get_worker_pool_error('e/id', 'wp/id');
      assert.deepEqual(rows, []);
    });
  });

  suite(`${testing.suiteName()} - workers`, function() {
    helper.dbTest('create_worker/get_worker', async function(db) {
      const now = new Date();
      await create_worker(db, { created: now, last_modified: now, last_checked: now, expires: now });

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.equal(rows[0].worker_group, 'w/group');
      assert.equal(rows[0].worker_id, 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.deepEqual(rows[0].created, now);
      assert.deepEqual(rows[0].expires, now);
      assert.equal(rows[0].state, 'state');
      assert.deepEqual(rows[0].provider_data, { providerdata: true });
      assert.equal(rows[0].capacity, 1);
      assert.deepEqual(rows[0].last_modified, now);
      assert.deepEqual(rows[0].last_checked, now);
    });

    helper.dbTest('create_worker/get_worker_2', async function(db) {
      const now = new Date();
      await create_worker(db, {
        created: now,
        last_modified: now,
        last_checked: now,
        expires: now,
      });

      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.equal(rows[0].worker_group, 'w/group');
      assert.equal(rows[0].worker_id, 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.deepEqual(rows[0].created, now);
      assert.deepEqual(rows[0].expires, now);
      assert.equal(rows[0].state, 'state');
      assert.deepEqual(rows[0].provider_data, { providerdata: true });
      assert.equal(rows[0].capacity, 1);
      assert.deepEqual(rows[0].last_modified, now);
      assert.deepEqual(rows[0].last_checked, now);
      assert.equal(rows[0].secret, null);
    });

    helper.dbTest('get_worker not found', async function(db) {
      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_2 not found', async function(db) {
      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('expire_workers', async function(db) {
      await create_worker(db, { worker_pool_id: 'done', provider_id: 'null-provider', expires: fromNow('- 1 day') });
      await create_worker(db, { worker_pool_id: 'also-done', expires: fromNow('- 2 days') });
      await create_worker(db, { worker_pool_id: 'still-running', expires: fromNow('1 day') });

      const count = (await db.fns.expire_workers(fromNow()))[0].expire_workers;
      assert.equal(count, 2);
      const rows = await db.fns.get_workers_without_provider_data(null, null, null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('get workers without provider_data', async function(db) {
      const now = new Date();
      for (let i = 0; i < 2; i++) {
        await create_worker(db, {
          worker_pool_id: `wp/${i}`,
          worker_group: `group${i}`,
          worker_id: `id${i}`,
          created: now,
          last_modified: now,
          last_checked: now,
          expires: now,
        });
      }

      let rows = await db.fns.get_workers_without_provider_data(null, null, null, null, null, null);
      assert.equal(rows.length, 2);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        assert(!row.provider_data);
        assert.equal(row.worker_pool_id, `wp/${i}`);
        assert.equal(row.worker_group, `group${i}`);
        assert.equal(row.worker_id, `id${i}`);
        assert.equal(row.provider_id, 'provider');
        assert.equal(row.state, 'state');
        assert.equal(row.created.toJSON(), now.toJSON());
        assert.equal(row.expires.toJSON(), now.toJSON());
        assert.equal(row.last_modified.toJSON(), now.toJSON());
        assert.equal(row.last_checked.toJSON(), now.toJSON());
        assert.equal(row.capacity, 1);
      }
    });

    helper.dbTest('get non-stopped workers', async function(db) {
      const now = new Date();

      let i = 0;
      // we are randomly ordering the ids to make sure rows are actually coming back ordered accordingly
      const randomOrderIds = [4, 6, 5, 3, 2, 7, 0, 1];
      for (let state of ["requested", "running", "stopping", "stopped", "requested", "running", "stopping", "stopped"]) {
        await create_worker(db, {
          worker_pool_id: `wp/${randomOrderIds[i]}`,
          worker_group: `group${randomOrderIds[i]}`,
          worker_id: `id${randomOrderIds[i]}`,
          created: now,
          last_modified: now,
          last_checked: now,
          expires: now,
          state,
        });
        i++;
      }

      const rows = await db.deprecatedFns.get_non_stopped_workers_2(null, null, null, null, null);

      assert.equal(rows.length, 6);

      i = 0;
      const nonStoppedIds = [0, 2, 4, 5, 6, 7];
      for (let row of rows) {
        assert.equal(row.worker_pool_id, `wp/${nonStoppedIds[i]}`);
        assert.equal(row.worker_group, `group${nonStoppedIds[i]}`);
        assert.equal(row.worker_id, `id${nonStoppedIds[i]}`);
        assert.equal(row.provider_id, 'provider');
        assert(row.state !== 'stopped');
        assert.equal(row.created.toJSON(), now.toJSON());
        assert.equal(row.expires.toJSON(), now.toJSON());
        assert.equal(row.last_modified.toJSON(), now.toJSON());
        assert.equal(row.last_checked.toJSON(), now.toJSON());
        assert.equal(row.capacity, 1);
        assert.deepEqual(row.provider_data, { providerdata: true });
        assert(row.secret !== undefined);
        assert(row.etag !== undefined);
        i++;
      }
    });

    helper.dbTest('get non-stopped workers with quarantine_until', async function(db) {
      const now = new Date();

      let i = 0;
      // we are randomly ordering the ids to make sure rows are actually coming back ordered accordingly
      const randomOrderIds = [4, 6, 5, 3, 2, 7, 0, 1];
      for (let state of ["requested", "running", "stopping", "stopped", "requested", "running", "stopping", "stopped"]) {
        await create_worker(db, {
          worker_pool_id: `wp/${randomOrderIds[i]}`,
          worker_group: `group${randomOrderIds[i]}`,
          worker_id: `id${randomOrderIds[i]}`,
          created: now,
          last_modified: now,
          last_checked: now,
          expires: now,
          state,
        });
        i++;
      }

      const quarantineUntil = fromNow('1 hour');
      await helper.withDbClient(async client => {
        // worker 4 is quarantined, and worker 6 has the same workerGroup/workerId as a quarantined worker
        // in another pool, and thus should not appear as quarantined here
        for (const [workerPoolId, workerGroup, workerId] of [
          ['wp/4', 'group4', 'id4'],
          ['wp/1', 'group6', 'id6'],
        ]) {
          await client.query(`
            insert
            into queue_workers
            (task_queue_id, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim, last_date_active) values
            ($1, $2, $3, jsonb_build_array(), $4, now() + interval '1 hour', now() - interval '1 hour', now())
          `, [workerPoolId, workerGroup, workerId, quarantineUntil]);
        }
      });

      const rows = await db.fns.get_non_stopped_workers_quntil_providers(null, null, null, null, null, null, null);

      assert.equal(rows.length, 6);

      i = 0;
      const nonStoppedIds = [0, 2, 4, 5, 6, 7];
      for (let row of rows) {
        assert.equal(row.worker_pool_id, `wp/${nonStoppedIds[i]}`);
        assert.equal(row.worker_group, `group${nonStoppedIds[i]}`);
        assert.equal(row.worker_id, `id${nonStoppedIds[i]}`);
        assert.equal(row.provider_id, 'provider');
        assert(row.state !== 'stopped');
        assert.equal(row.created.toJSON(), now.toJSON());
        assert.equal(row.expires.toJSON(), now.toJSON());
        assert.equal(row.last_modified.toJSON(), now.toJSON());
        assert.equal(row.last_checked.toJSON(), now.toJSON());
        assert.equal(row.capacity, 1);
        assert.deepEqual(row.provider_data, { providerdata: true });
        assert(row.secret !== undefined);
        assert(row.etag !== undefined);
        assert.deepEqual(row.quarantine_until, nonStoppedIds[i] === 4 ? quarantineUntil : null);
        i++;
      }
    });

    helper.dbTest('get non-stopped workers by provider', async function(db) {
      const now = new Date();

      let i = 0;
      for (const provider_id of ["azure", "static", "aws", "gcp"]) {
        await create_worker(db, {
          worker_id: `id${i++}`,
          state: 'running',
          provider_id,
          created: now,
          last_modified: now,
          last_checked: now,
          expires: now,
        });
      }

      const testRuns = [
        { providers_filter_cond: null, providers_filter_value: null, expected_count: 4 },
        { providers_filter_cond: '=', providers_filter_value: null, expected_count: 4 }, // ignoring partial condition
        { providers_filter_cond: null, providers_filter_value: 'a', expected_count: 4 }, // ignoring partial condition
        { providers_filter_cond: '=', providers_filter_value: 'aws', expected_count: 1 },
        { providers_filter_cond: '<>', providers_filter_value: 'aws', expected_count: 3 },
        { providers_filter_cond: '=', providers_filter_value: 'aws,static', expected_count: 2 },
        { providers_filter_cond: '<>', providers_filter_value: 'aws,static', expected_count: 2 },
        { providers_filter_cond: '=', providers_filter_value: 'static', expected_count: 1 },
        { providers_filter_cond: '<>', providers_filter_value: 'non-existent', expected_count: 4 },
        { providers_filter_cond: '=', providers_filter_value: 'non-existent', expected_count: 0 },
        { providers_filter_cond: '=', providers_filter_value: 'azure,static,aws,gcp', expected_count: 4 },
      ];

      for (const run of testRuns) {
        const rows = await db.fns.get_non_stopped_workers_quntil_providers(
          null, null, null, run.providers_filter_cond, run.providers_filter_value, null, null);

        assert.equal(rows.length, run.expected_count);
      }
    });

    helper.dbTest('update_worker, change to a single field', async function(db) {
      const etag = await create_worker(db);
      await db.deprecatedFns.update_worker(
        'wp/id',
        'w/group',
        'w/id',
        'provider2',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        etag,
      );

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.equal(rows[0].worker_group, 'w/group');
      assert.equal(rows[0].worker_id, 'w/id');
      assert.equal(rows[0].provider_id, 'provider2');
      assert(rows[0].created instanceof Date);
      assert(rows[0].expires instanceof Date);
      assert.equal(rows[0].state, 'state');
      assert.deepEqual(rows[0].provider_data, { providerdata: true });
      assert.equal(rows[0].capacity, 1);
      assert(rows[0].last_modified instanceof Date);
      assert(rows[0].last_checked instanceof Date);
    });

    helper.dbTest('update_worker_2, change to a single field', async function(db) {
      const etag = await create_worker(db);
      const secret = `${slug.v4()}${slug.v4()}`;
      const encryptedSecret = db.encrypt({ value: Buffer.from(secret, 'utf8') });
      await db.fns.update_worker_2(
        'wp/id',
        'w/group',
        'w/id',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        etag,
        encryptedSecret,
      );

      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.equal(rows[0].worker_group, 'w/group');
      assert.equal(rows[0].worker_id, 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert(rows[0].created instanceof Date);
      assert(rows[0].expires instanceof Date);
      assert.equal(rows[0].state, 'state');
      assert.deepEqual(rows[0].provider_data, { providerdata: true });
      assert.equal(rows[0].capacity, 1);
      assert(rows[0].last_modified instanceof Date);
      assert(rows[0].last_checked instanceof Date);
      assert.deepEqual(rows[0].secret, encryptedSecret);
    });

    helper.dbTest('update_worker, change to a multiple fields', async function(db) {
      const etag = await create_worker(db);
      const updated = await db.deprecatedFns.update_worker(
        'wp/id',
        'w/group',
        'w/id',
        'provider2',
        null,
        null,
        'requested',
        null,
        null,
        null,
        null,
        etag,
      );

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider2');
      assert.equal(rows[0].state, 'requested');
      assert.deepEqual(updated, rows);
    });

    helper.dbTest('update_worker_2, change to a multiple fields', async function(db) {
      const etag = await create_worker(db);
      const updated = await db.fns.update_worker_2(
        'wp/id',
        'w/group',
        'w/id',
        'provider2',
        null,
        null,
        'requested',
        null,
        null,
        null,
        null,
        etag,
        null,
      );

      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider2');
      assert.equal(rows[0].state, 'requested');
      assert.deepEqual(updated, rows);
    });

    helper.dbTest('update_worker, no changes', async function(db) {
      const etag = await create_worker(db);
      const updated = await db.deprecatedFns.update_worker(
        'wp/id',
        'w/group',
        'w/id',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        etag,
      );
      // this is not 0 because there was a row that matched even though there was no change
      assert.equal(updated.length, 1);

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.equal(rows[0].state, 'state');
    });

    helper.dbTest('update_worker_2, no changes', async function(db) {
      const etag = await create_worker(db);
      const updated = await db.fns.update_worker_2(
        'wp/id',
        'w/group',
        'w/id',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        etag,
        null,
      );
      // this is not 0 because there was a row that matched even though there was no change
      assert.equal(updated.length, 1);

      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.equal(rows[0].state, 'state');
    });

    helper.dbTest('update_worker, worker doesn\'t exist', async function(db) {
      const etag = await create_worker(db);

      await assert.rejects(
        async () => {
          await update_worker(db, { worker_pool_id: 'does-not-exist' }, etag);
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker_2, worker doesn\'t exist', async function(db) {
      const etag = await create_worker(db);

      await assert.rejects(
        async () => {
          await update_worker_2(db, { worker_pool_id: 'does-not-exist' }, etag);
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker, override when etag not specified', async function(db) {
      await create_worker(db);
      await db.deprecatedFns.update_worker(
        'wp/id',
        'w/group',
        'w/id',
        null,
        null,
        null,
        null,
        null,
        2, /* capacity */
        null,
        null,
        null, /* etag */
      );

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].capacity, 2);
    });

    helper.dbTest('update_worker_2, override when etag not specified', async function(db) {
      await create_worker(db);
      await db.fns.update_worker_2(
        'wp/id',
        'w/group',
        'w/id',
        null,
        null,
        null,
        null,
        null,
        2, /* capacity */
        null,
        null,
        null, /* etag */
        null,
      );

      const rows = await db.fns.get_worker_2('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].capacity, 2);
    });

    helper.dbTest('update_worker, throws when etag is wrong', async function(db) {
      await create_worker(db);
      await assert.rejects(
        async () => {
          await db.deprecatedFns.update_worker(
            'wp/id',
            'w/group',
            'w/id',
            null,
            null,
            null,
            null,
            null,
            2, /* capacity */
            null,
            null,
            '915a609a-f3bb-42fa-b584-a1209e7d9a02', /* etag */
          );
        },
        /unsuccessful update/,
      );
    });

    helper.dbTest('update_worker_2, throws when etag is wrong', async function(db) {
      await create_worker(db);
      await assert.rejects(
        async () => {
          await db.fns.update_worker_2(
            'wp/id',
            'w/group',
            'w/id',
            null,
            null,
            null,
            null,
            null,
            2, /* capacity */
            null,
            null,
            '915a609a-f3bb-42fa-b584-a1209e7d9a02', /* etag */
            null,
          );
        },
        /unsuccessful update/,
      );
    });

    helper.dbTest('update_worker, throws when row does not exist', async function(db) {
      const etag = await create_worker(db);
      await assert.rejects(
        async () => {
          await db.deprecatedFns.update_worker(
            'does-not-exist',
            'w/group',
            'w/id',
            null,
            null,
            null,
            null,
            null,
            2, /* capacity */
            null,
            null,
            etag,
          );
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker_2, throws when row does not exist', async function(db) {
      const etag = await create_worker(db);
      await assert.rejects(
        async () => {
          await db.fns.update_worker_2(
            'does-not-exist',
            'w/group',
            'w/id',
            null,
            null,
            null,
            null,
            null,
            2, /* capacity */
            null,
            null,
            etag,
            null,
          );
        },
        /no such row/,
      );
    });

    helper.dbTest('delete_worker', async function(db) {
      await create_worker_pool(db);

      await db.fns.delete_worker('wp/id', 'w/group', 'w/id');

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });
  });

  suite('existing capacity', function() {
    helper.dbTest('no workers', async function(db) {
      await create_worker_pool(db);
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 0);
      assert.equal(row.requested_count, 0);
      assert.equal(row.running_count, 0);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 0);
      assert.equal(row.requested_capacity, 0);
      assert.equal(row.running_capacity, 0);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 0);
    });
    helper.dbTest('single worker, capacity 1', async function(db) {
      await create_worker_pool(db);
      await create_worker(db, { capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 1);
      assert.equal(row.requested_count, 0);
      assert.equal(row.running_count, 1);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 0);
      assert.equal(row.requested_capacity, 0);
      assert.equal(row.running_capacity, 1);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 0);
    });
    helper.dbTest('single worker, capacity > 1', async function(db) {
      await create_worker_pool(db);
      await create_worker(db, { capacity: 64, state: 'running' });
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 64);
      assert.equal(row.requested_count, 0);
      assert.equal(row.running_count, 1);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 0);
      assert.equal(row.requested_capacity, 0);
      assert.equal(row.running_capacity, 64);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 0);
    });
    helper.dbTest('multiple workers, capacity 1', async function(db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 4);
      assert.equal(row.requested_count, 0);
      assert.equal(row.running_count, 4);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 0);
      assert.equal(row.requested_capacity, 0);
      assert.equal(row.running_capacity, 4);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 0);
    });
    helper.dbTest('multiple workers, capacity > 1', async function(db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 32, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 161);
      assert.equal(row.requested_count, 0);
      assert.equal(row.running_count, 4);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 0);
      assert.equal(row.requested_capacity, 0);
      assert.equal(row.running_capacity, 161);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 0);
    });
    helper.dbTest('multiple workers, multiple states', async function(db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 32, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 64, state: 'stopped' });
      await create_worker(db, { worker_id: 'foo3', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'requested' });
      const row = (await db.fns.get_worker_pool_with_capacity_and_counts_by_state('wp/id'))[0];
      assert.equal(row.current_capacity, 97);
      assert.equal(row.requested_count, 1);
      assert.equal(row.running_count, 2);
      assert.equal(row.stopping_count, 0);
      assert.equal(row.stopped_count, 1);
      assert.equal(row.requested_capacity, 1);
      assert.equal(row.running_capacity, 96);
      assert.equal(row.stopping_capacity, 0);
      assert.equal(row.stopped_capacity, 64);
    });
    helper.dbTest('no workers (multiple pools)', async function(db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      const pools = (await db.fns.get_worker_pools_with_capacity_and_counts_by_state(null, null)).sort();
      assert.equal(pools[0].current_capacity, 0);
      assert.equal(pools[1].current_capacity, 0);
    });
    helper.dbTest('single worker (multiple pools)', async function(db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      await create_worker(db, { capacity: 4, state: 'running' });
      const pools = (await db.fns.get_worker_pools_with_capacity_and_counts_by_state(null, null)).sort();
      assert.equal(pools[0].worker_pool_id, 'ff/tt');
      assert.equal(pools[1].worker_pool_id, 'wp/id');
      assert.equal(pools[0].current_capacity, 0);
      assert.equal(pools[1].current_capacity, 4);
    });
    helper.dbTest('multiple workers (multiple pools)', async function(db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      await create_worker(db, { worker_id: 'foo1', capacity: 4, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 10, state: 'running', worker_pool_id: 'ff/tt' });
      await create_worker(db, { worker_id: 'foo4', capacity: 3, state: 'stopped' });
      await create_worker(db, { worker_id: 'foo5', capacity: 7, state: 'stopped', worker_pool_id: 'ff/tt' });
      const pools = (await db.fns.get_worker_pools_with_capacity_and_counts_by_state(null, null)).sort();
      assert.equal(pools[0].worker_pool_id, 'ff/tt');
      assert.equal(pools[1].worker_pool_id, 'wp/id');
      assert.equal(pools[0].current_capacity, 10);
      assert.equal(pools[1].current_capacity, 5);
    });
  });

  suite(`${testing.suiteName()} - TaskQueue`, function() {
    helper.dbTest('no such task queue', async function(db) {
      const res = await db.fns.get_task_queue_wm_2('prov/wt', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_task_queues_wm empty', async function(db) {
      const res = await db.fns.get_task_queues_wm(null, null, null, null);
      assert.deepEqual(res, []);
    });
  });
});
