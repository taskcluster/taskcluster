import _ from 'lodash';
import slug from 'slugid';
import { strict as assert } from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
import tc from '@taskcluster/client';
const { fromNow } = tc;

/** @typedef {import('@taskcluster/lib-postgres').Database} Database */

suite(testing.suiteName(), function () {
  helper.withDbForProcs({ serviceName: 'worker_manager' });

  setup('reset table', async function () {
    await helper.withDbClient(async client => {
      await client.query('delete from worker_pools');
      await client.query('delete from worker_pool_errors');
      await client.query('delete from workers');
      await client.query('delete from queue_workers');
    });
  });

  // worker-manager entities functions are tested by entities_test.js and by the worker-manager service tests

  /**
   * @param {Database} db
   * @param {Record<string, any>} wp
   */
  const create_worker_pool = async (db, wp = {}) => {
    await db.fns.create_worker_pool_with_launch_configs(
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
  /**
   * @param {Database} db
   * @param {Record<string, any>} wp
   */
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
    const upd = await db.fns.update_worker_pool_with_launch_configs(...input);
    if (upd.length === 1) {
      delete upd[0].created_launch_configs;
      delete upd[0].archived_launch_configs;
      delete upd[0].updated_launch_configs;
    }
    const old = await db.deprecatedFns.update_worker_pool_with_capacity(...input);
    if (old.length === 1) {
      delete old[0].current_capacity;
    }
    // We override previous_provider_id in this comparison because a side-effect
    // of calling this function is updating that value so we can't compare here
    assert.deepEqual({ ...upd[0], previous_provider_id: '' }, { ...old[0], previous_provider_id: '' });
    return upd;
  };
  /**
   * @param {Database} db
   * @param {Record<string, any>} e
   */
  const create_worker_pool_error = async (db, e = {}) => {
    await db.fns.create_worker_pool_error_launch_config(
      e.error_id || 'e/id',
      e.worker_pool_id || 'wp/id',
      e.reported || new Date(),
      e.kind || 'kind',
      e.title || 'title',
      e.description || 'descr',
      e.extra || { extra: true },
      e.launch_config_id || null,
    );
  };
  /**
   * @param {Database} db
   * @param {Record<string, any>} w
   */
  const create_worker = async (db, w = {}) => {
    return (await db.fns.create_worker_with_lc(
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
      w.launch_config_id || null,
    ))[0].create_worker_with_lc;
  };
  /**
   * @param {Database} db
   * @param {Record<string, any>} w
   * @param {string} etag
   */
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
  /**
   * @param {Database} db
   * @param {Record<string, any>} w
   * @param {string} etag
   */
  const update_worker_3 = async (db, w = {}, etag) => {
    return await db.fns.update_worker_3(
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

  /**
   * @param {Database} db
   * @param {string} worker_pool_id
   */
  const get_worker_pool = async (db, worker_pool_id) => {
    const workerPool = await db.fns.get_worker_pool_with_launch_configs(worker_pool_id);
    const old = await db.deprecatedFns.get_worker_pool_with_capacity(worker_pool_id);
    delete old?.[0]?.current_capacity;
    assert.deepEqual(workerPool, old);
    return workerPool;
  };

  /**
   * @param {Database} db
   * @param {number} page_size
   * @param {number} page_offset
   */
  const get_worker_pools = async (db, page_size, page_offset) => {
    const with_cap = await db.fns.get_worker_pools_with_launch_configs(page_size, page_offset);
    const old = await db.deprecatedFns.get_worker_pools_with_capacity(page_size, page_offset);
    for (let i = 0; i < old.length; i++) {
      delete old[i].current_capacity;
    }
    assert.deepEqual(with_cap, old);
    return with_cap;
  };

  suite(`${testing.suiteName()} - worker_pools`, function () {
    helper.dbTest('create_worker_pool/get_worker_pool', async function (db) {
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

    helper.dbTest('get_worker_pool not found', async function (db) {
      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pools empty', async function (db) {
      const rows = await get_worker_pools(db, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pools full, pagination', async function (db) {
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

    helper.dbTest('update_worker_pool, change to providerId', async function (db) {
      await create_worker_pool(db);
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('update_worker_pool, change to providerId, new provider already in previous', async function (db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['provider2']) });
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('update_worker_pool, change to providerId, old provider already in previous', async function (db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['provider']) });
      const upd = await update_worker_pool(db, { provider_id: 'provider2' });
      assert.deepEqual(upd[0].previous_provider_id, 'provider');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['provider']);
    });

    helper.dbTest('expire_worker_pool', async function (db) {
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

    helper.dbTest('delete_worker_pool', async function (db) {
      await create_worker_pool(db);

      await db.fns.delete_worker_pool('wp/id');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id', async function (db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['old1', 'old2']) });

      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['old2']);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id, no worker-pool', async function (db) {
      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'old1');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('remove_worker_pool_previous_provider_id, no such provider', async function (db) {
      await create_worker_pool(db, { previous_provider_ids: JSON.stringify(['old1', 'old2']) });

      await db.fns.remove_worker_pool_previous_provider_id('wp/id', 'unknown');

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].previous_provider_ids, ['old1', 'old2']);
    });

    helper.dbTest('update_worker_pool_provider_data', async function (db) {
      await create_worker_pool(db, { provider_data: { someprov: { somedata: true } } });

      await db.fns.update_worker_pool_provider_data('wp/id', 'another', { moredata: true });

      const rows = await get_worker_pool(db, 'wp/id');
      assert.deepEqual(rows[0].provider_data, {
        someprov: { somedata: true },
        another: { moredata: true },
      });
    });
  });

  suite(`${testing.suiteName()} - worker_pool_errors`, function () {
    helper.dbTest('create_worker_pool_error/get_worker_pool_error', async function (db) {
      const now = new Date();
      await create_worker_pool_error(db, { reported: now, launch_config_id: 'lc/id' });
      const rows = await db.fns.get_worker_pool_error_launch_config('e/id', 'wp/id');
      assert.equal(rows[0].error_id, 'e/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.deepEqual(rows[0].reported, now);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.equal(rows[0].launch_config_id, 'lc/id');
      assert.deepEqual(rows[0].extra, { extra: true });
    });

    helper.dbTest('get_worker_pool_error not found', async function (db) {
      const rows = await db.fns.get_worker_pool_error_launch_config('e/id', 'wp/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool empty', async function (db) {
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool empty query', async function (db) {
      const now = new Date();
      await create_worker_pool_error(db, { reported: now });
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.equal(rows[0].error_id, 'e/id');
      assert.equal(rows[0].worker_pool_id, 'wp/id');
      assert.deepEqual(rows[0].reported, now);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].extra, { extra: true });
    });

    helper.dbTest('get_worker_pool_errors_for_worker_pool full, pagination', async function (db) {
      let newestDate;
      for (let i = 9; i >= 0; i--) {
        newestDate = fromNow(`- ${i} days`);
        await create_worker_pool_error(db, {
          error_id: `e/${i}`,
          worker_pool_id: `wp/${i}`,
          reported: newestDate,
        });
      }

      let rows = await db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.deepEqual(
        rows.map(r => ({ error_id: r.error_id, worker_pool_id: r.worker_pool_id })),
        _.range(10).map(i => ({ error_id: `e/${i}`, worker_pool_id: `wp/${i}` })));
      assert.deepEqual(rows[0].reported, newestDate);
      assert.equal(rows[0].kind, 'kind');
      assert.equal(rows[0].title, 'title');
      assert.equal(rows[0].description, 'descr');
      assert.deepEqual(rows[0].extra, { extra: true });

      rows = await db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, 2, 4);
      assert.deepEqual(
        rows.map(r => ({ error_id: r.error_id, worker_pool_id: r.worker_pool_id })),
        [4, 5].map(i => ({ error_id: `e/${i}`, worker_pool_id: `wp/${i}` })));
    });

    helper.dbTest('expire_worker_pool_errors', async function (db) {
      await create_worker_pool_error(db, { error_id: 'done', reported: fromNow('- 1 day') });
      await create_worker_pool_error(db, { error_id: 'also-done', reported: fromNow('- 2 days') });
      await create_worker_pool_error(db, { error_id: 'still-running', reported: fromNow('1 day') });

      const count = (await db.fns.expire_worker_pool_errors(fromNow()))[0].expire_worker_pool_errors;
      assert.equal(count, 2);
      const rows = await db.fns.get_worker_pool_errors_for_worker_pool2(null, null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('delete_worker_pool_errors', async function (db) {
      await create_worker_pool_error(db);

      await db.fns.delete_worker_pool_error('e/id', 'wp/id');

      const rows = await db.fns.get_worker_pool_error_launch_config('e/id', 'wp/id');
      assert.deepEqual(rows, []);
    });
    helper.dbTest('get_worker_pool_error_stats_last_24_hours', async function (db) {
      await create_worker_pool_error(db, { error_id: 'id1', worker_pool_id: 'wp/id1' });
      await create_worker_pool_error(db, { error_id: 'id2', worker_pool_id: 'wp/id2' });

      const res = await db.fns.get_worker_pool_error_stats_last_24_hours(null);
      assert.equal(res.length, 24);
      assert.equal(res[23].count, 2); // latest record is last hour

      const res2 = await db.fns.get_worker_pool_error_stats_last_24_hours('wp/id1');
      assert.equal(res2.length, 24);
      assert.equal(res2[23].count, 1);

      const res3 = await db.fns.get_worker_pool_error_stats_last_24_hours('wp/id2');
      assert.equal(res3.length, 24);
      assert.equal(res3[23].count, 1);
    });
    helper.dbTest('get_worker_pool_error_stats_last_7_days', async function (db) {
      await create_worker_pool_error(db, { error_id: 'id1', worker_pool_id: 'wp/id1' });
      await create_worker_pool_error(db, { error_id: 'id2', worker_pool_id: 'wp/id2' });

      const res = await db.fns.get_worker_pool_error_stats_last_7_days(null);
      assert.equal(res.length, 7);
      assert.equal(res[6].count, 2); // latest record is last hour

      const res2 = await db.fns.get_worker_pool_error_stats_last_7_days('wp/id1');
      assert.equal(res2.length, 7);
      assert.equal(res2[6].count, 1);

      const res3 = await db.fns.get_worker_pool_error_stats_last_7_days('wp/id2');
      assert.equal(res3.length, 7);
      assert.equal(res3[6].count, 1);
    });
    helper.dbTest('get_worker_pool_error_titles', async function (db) {
      await create_worker_pool_error(db, { error_id: 'id1', title: 'title1', worker_pool_id: 'wp/id1' });
      await create_worker_pool_error(db, { error_id: 'id2', title: 'title2', worker_pool_id: 'wp/id2' });

      const res = await db.fns.get_worker_pool_error_titles(null);
      assert.equal(res.length, 2);
      assert.equal(res[0].count, 1);
      assert.equal(res[1].count, 1);
    });
    helper.dbTest('get_worker_pool_error_codes', async function (db) {
      await create_worker_pool_error(db, { error_id: 'id1', kind: 'kind1', worker_pool_id: 'wp/id1', extra: { code: 'c1' } });
      await create_worker_pool_error(db, { error_id: 'id2', kind: 'kind2', worker_pool_id: 'wp/id2', extra: { code: 'c2' } });

      const res = await db.fns.get_worker_pool_error_codes(null);
      assert.equal(res.length, 2);
      assert.equal(res[0].count, 1);
      assert.equal(res[1].count, 1);
    });

  });

  suite(`${testing.suiteName()} - workers`, function () {
    helper.dbTest('create_worker/get_worker', async function (db) {
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

    helper.dbTest('create_worker/get_worker_3', async function (db) {
      const now = new Date();
      await create_worker(db, {
        created: now,
        last_modified: now,
        last_checked: now,
        expires: now,
      });

      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
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

    helper.dbTest('get_worker not found', async function (db) {
      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('get_worker_3 not found', async function (db) {
      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });

    helper.dbTest('expire_workers', async function (db) {
      await create_worker(db, { worker_pool_id: 'done', provider_id: 'null-provider', expires: fromNow('- 1 day') });
      await create_worker(db, { worker_pool_id: 'also-done', expires: fromNow('- 2 days') });
      await create_worker(db, { worker_pool_id: 'still-running', expires: fromNow('1 day') });

      const count = (await db.fns.expire_workers(fromNow()))[0].expire_workers;
      assert.equal(count, 2);
      const rows = await db.fns.get_worker_manager_workers2(null, null, null, null, null, null, null);
      assert.equal(rows.length, 1);
    });

    helper.dbTest('get workers without provider_data', async function (db) {
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

      let rows = await db.fns.get_worker_manager_workers2(null, null, null, null, null, null, null);
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

    helper.dbTest('get non-stopped workers', async function (db) {
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

    helper.dbTest('get non-stopped workers with quarantine_until', async function (db) {
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

      const rows = await db.deprecatedFns.get_non_stopped_workers_quntil_providers(
        null, null, null, null, null, null, null);

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

    helper.dbTest('get non-stopped workers with queue view timestamps ', async function (db) {
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
      const firstClaim = fromNow('-1 hour');
      const lastDateActive = fromNow('-1 minute');
      await helper.withDbClient(async client => {
        // worker 4 is quarantined, and worker 6 has the same workerGroup/workerId as a quarantined worker
        // in another pool, and thus should not appear as quarantined here
        for (const [workerPoolId, workerGroup, workerId] of [
          ['wp/4', 'group4', 'id4'],
          ['wp/6', 'group6', 'id6'],
        ]) {
          await client.query(`
            insert
            into queue_workers
            (task_queue_id, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim, last_date_active) values
            ($1, $2, $3, jsonb_build_array(), $4, now() + interval '1 hour', $5, $6)
          `, [workerPoolId, workerGroup, workerId, quarantineUntil, firstClaim, lastDateActive]);
        }
      });

      const rows = await db.fns.get_non_stopped_workers_with_launch_config_scanner(
        null, null, null, null, null, null, null);

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
        assert.deepEqual(row.quarantine_until, ['id4', 'id6'].includes(row.worker_id) ? quarantineUntil : null);
        assert.equal(row.first_claim?.toJSON(), ['id4', 'id6'].includes(row.worker_id) ? firstClaim.toJSON() : undefined);
        assert.equal(row.last_date_active?.toJSON(), ['id4', 'id6'].includes(row.worker_id) ? lastDateActive.toJSON() : undefined);
        i++;
      }
    });

    helper.dbTest('get non-stopped workers by provider', async function (db) {
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
        const rows = await db.deprecatedFns.get_non_stopped_workers_quntil_providers(
          null, null, null, run.providers_filter_cond, run.providers_filter_value, null, null);

        assert.equal(rows.length, run.expected_count);
      }
    });

    helper.dbTest('update_worker, change to a single field', async function (db) {
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

    helper.dbTest('update_worker_3, change to a single field', async function (db) {
      const etag = await create_worker(db);
      const secret = `${slug.v4()}${slug.v4()}`;
      const encryptedSecret = db.encrypt({ value: Buffer.from(secret, 'utf8') });
      await db.fns.update_worker_3(
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

      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
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

    helper.dbTest('update_worker, change to a multiple fields', async function (db) {
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

    helper.dbTest('update_worker_3, change to a multiple fields', async function (db) {
      const etag = await create_worker(db);
      const updated = await db.fns.update_worker_3(
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

      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider2');
      assert.equal(rows[0].state, 'requested');
      assert.deepEqual(updated, rows);
    });

    helper.dbTest('update_worker, no changes', async function (db) {
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

    helper.dbTest('update_worker_3, no changes', async function (db) {
      const etag = await create_worker(db);
      const updated = await db.fns.update_worker_3(
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

      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].provider_id, 'provider');
      assert.equal(rows[0].state, 'state');
    });

    helper.dbTest('update_worker, worker doesn\'t exist', async function (db) {
      const etag = await create_worker(db);

      await assert.rejects(
        async () => {
          await update_worker(db, { worker_pool_id: 'does-not-exist' }, etag);
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker_3, worker doesn\'t exist', async function (db) {
      const etag = await create_worker(db);

      await assert.rejects(
        async () => {
          await update_worker_3(db, { worker_pool_id: 'does-not-exist' }, etag);
        },
        /no such row/,
      );
    });

    helper.dbTest('update_worker, override when etag not specified', async function (db) {
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

    helper.dbTest('update_worker_3, override when etag not specified', async function (db) {
      await create_worker(db);
      await db.fns.update_worker_3(
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

      const rows = await db.fns.get_worker_3('wp/id', 'w/group', 'w/id');
      assert.equal(rows[0].capacity, 2);
    });

    helper.dbTest('update_worker, throws when etag is wrong', async function (db) {
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

    helper.dbTest('update_worker_3, throws when etag is wrong', async function (db) {
      await create_worker(db);
      await assert.rejects(
        async () => {
          await db.fns.update_worker_3(
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

    helper.dbTest('update_worker, throws when row does not exist', async function (db) {
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

    helper.dbTest('update_worker_3, throws when row does not exist', async function (db) {
      const etag = await create_worker(db);
      await assert.rejects(
        async () => {
          await db.fns.update_worker_3(
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

    helper.dbTest('delete_worker', async function (db) {
      await create_worker_pool(db);

      await db.fns.delete_worker('wp/id', 'w/group', 'w/id');

      const rows = await db.deprecatedFns.get_worker('wp/id', 'w/group', 'w/id');
      assert.deepEqual(rows, []);
    });
  });

  suite('existing capacity', function () {
    helper.dbTest('no workers', async function (db) {
      await create_worker_pool(db);
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('single worker, capacity 1', async function (db) {
      await create_worker_pool(db);
      await create_worker(db, { capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('single worker, capacity > 1', async function (db) {
      await create_worker_pool(db);
      await create_worker(db, { capacity: 64, state: 'running' });
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('multiple workers, capacity 1', async function (db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('multiple workers, capacity > 1', async function (db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 32, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'running' });
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('multiple workers, multiple states', async function (db) {
      await create_worker_pool(db);
      await create_worker(db, { worker_id: 'foo1', capacity: 32, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 64, state: 'stopped' });
      await create_worker(db, { worker_id: 'foo3', capacity: 64, state: 'running' });
      await create_worker(db, { worker_id: 'foo4', capacity: 1, state: 'requested' });
      const row = (await db.fns.get_worker_pool_counts_and_capacity('wp/id'))[0];
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
    helper.dbTest('no workers (multiple pools)', async function (db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      const pools = (await db.fns.get_worker_pools_counts_and_capacity(null, null)).sort();
      assert.equal(pools[0].current_capacity, 0);
      assert.equal(pools[1].current_capacity, 0);
    });
    helper.dbTest('single worker (multiple pools)', async function (db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      await create_worker(db, { capacity: 4, state: 'running' });
      const pools = (await db.fns.get_worker_pools_counts_and_capacity(null, null)).sort();
      assert.equal(pools[0].worker_pool_id, 'ff/tt');
      assert.equal(pools[1].worker_pool_id, 'wp/id');
      assert.equal(pools[0].current_capacity, 0);
      assert.equal(pools[1].current_capacity, 4);
    });
    helper.dbTest('multiple workers (multiple pools)', async function (db) {
      await create_worker_pool(db);
      await create_worker_pool(db, { worker_pool_id: 'ff/tt' });
      await create_worker(db, { worker_id: 'foo1', capacity: 4, state: 'running' });
      await create_worker(db, { worker_id: 'foo2', capacity: 1, state: 'running' });
      await create_worker(db, { worker_id: 'foo3', capacity: 10, state: 'running', worker_pool_id: 'ff/tt' });
      await create_worker(db, { worker_id: 'foo4', capacity: 3, state: 'stopped' });
      await create_worker(db, { worker_id: 'foo5', capacity: 7, state: 'stopped', worker_pool_id: 'ff/tt' });
      const pools = (await db.fns.get_worker_pools_counts_and_capacity(null, null)).sort();
      assert.equal(pools[0].worker_pool_id, 'ff/tt');
      assert.equal(pools[1].worker_pool_id, 'wp/id');
      assert.equal(pools[0].current_capacity, 10);
      assert.equal(pools[1].current_capacity, 5);
    });

    suite('launch configs', function () {
      helper.dbTest('launch configs statistics for a worker pool', async function (db) {
        await create_worker_pool(db, { worker_pool_id: 'll/cc' });
        await create_worker(db, { worker_id: 'foo1', capacity: 4, worker_pool_id: 'll/cc', state: 'running', launch_config_id: 'lc1' });
        await create_worker(db, { worker_id: 'foo2', capacity: 1, worker_pool_id: 'll/cc', state: 'running', launch_config_id: 'lc1' });
        await create_worker(db, { worker_id: 'foo3', capacity: 3, worker_pool_id: 'll/cc', state: 'stopping', launch_config_id: 'lc1' });
        await create_worker(db, { worker_id: 'foo4', capacity: 1, worker_pool_id: 'll/cc', state: 'requested', launch_config_id: 'lc1' });
        await create_worker(db, { worker_id: 'foo5', capacity: 3, worker_pool_id: 'll/cc', state: 'stopped', launch_config_id: 'lc3' });
        await create_worker(db, { worker_id: 'foo6', capacity: 7, worker_pool_id: 'll/cc', state: 'stopped', launch_config_id: 'lc3' });

        const stats = await db.fns.get_worker_pool_counts_and_capacity_lc('ll/cc', null);
        const lc1 = stats.filter(lc => lc.launch_config_id === 'lc1');
        assert.equal(lc1.length, 1);
        assert.equal(lc1[0].worker_pool_id, 'll/cc');
        assert.equal(lc1[0].running_count, 2);
        assert.equal(lc1[0].running_capacity, 5);
        assert.equal(lc1[0].stopping_count, 1);
        assert.equal(lc1[0].stopping_capacity, 3);
        assert.equal(lc1[0].stopped_count, 0);
        assert.equal(lc1[0].stopped_capacity, 0);
        assert.equal(lc1[0].requested_count, 1);
        assert.equal(lc1[0].requested_capacity, 1);

        const lc3 = stats.filter(lc => lc.launch_config_id === 'lc3');
        assert.equal(lc3.length, 1);
        assert.equal(lc3[0].worker_pool_id, 'll/cc');
        assert.equal(lc3[0].running_count, 0);
        assert.equal(lc3[0].running_capacity, 0);
        assert.equal(lc3[0].stopping_count, 0);
        assert.equal(lc3[0].stopping_capacity, 0);
        assert.equal(lc3[0].stopped_count, 2);
        assert.equal(lc3[0].stopped_capacity, 10);
        assert.equal(lc3[0].requested_count, 0);
        assert.equal(lc3[0].requested_capacity, 0);
      });
    });
  });

  suite(`${testing.suiteName()} - TaskQueue`, function () {
    helper.dbTest('no such task queue', async function (db) {
      const res = await db.fns.get_task_queue_wm_2('prov/wt', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_task_queues_wm empty', async function (db) {
      const res = await db.fns.get_task_queues_wm(null, null, null, null);
      assert.deepEqual(res, []);
    });
  });

  suite(`${testing.suiteName()} - Worker Pool Launch Configs`, function () {
    const assertEqualSorted = (arr1, arr2) => {
      arr1.sort();
      arr2.sort();
      assert.deepEqual(arr1, arr2);
    };

    helper.dbTest('create_worker_pool_launch_config/get_worker_pool_launch_configs', async function (db) {
      const wpId = 'w/i1';
      await db.fns.create_worker_pool_launch_config('lc1', wpId, false, { config: '1' }, fromNow('0s'), fromNow('0s'));
      await db.fns.create_worker_pool_launch_config('lc2', wpId, false, {
        config: '2',
        workerManager: { maxCapacity: 2 },
      }, fromNow('0s'), fromNow('0s'));

      const configs = await db.fns.get_worker_pool_launch_configs(wpId, null, null, null);
      assert.equal(configs.length, 2);
      assertEqualSorted(configs.map(c => c.launch_config_id), ['lc1', 'lc2']);

      const res = await db.fns.collect_launch_configs_if_exist({ max: 9 }, wpId);
      // rows should include launchConfigIds inside of workerManager
      assert.deepEqual(res[0].collect_launch_configs_if_exist, {
        max: 9,
        launchConfigs: [{
          workerManager: { launchConfigId: 'lc1' },
          config: '1',
        }, {
          workerManager: { launchConfigId: 'lc2', maxCapacity: 2 },
          config: '2',
        }],
      });
    });

    helper.dbTest('upsert_worker_pool_launch_configs returns expected ids', async function (db) {
      const launchConfigs = [
        { cfg: 'c1', workerManager: { maxCapacity: 5 } },
        { cfg: 'c2', workerManager: { maxCapacity: 5 } },
        { cfg: 'c3', workerManager: { maxCapacity: 5 } },
      ];
      const [res] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs,
      });
      assert.equal(res.created_launch_configs.length, 3);
      assert.equal(res.updated_launch_configs.length, 0);
      assert.equal(res.archived_launch_configs.length, 0);

      // changing workerManager related values shouldn't change ids
      launchConfigs[0].workerManager.maxCapacity = 10;
      launchConfigs[1].workerManager.initialWeight = 1.0;
      const [res1] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs,
      });
      assert.equal(res1.created_launch_configs.length, 0);
      assert.equal(res1.updated_launch_configs.length, 3);
      assert.equal(res1.archived_launch_configs.length, 0);

      const [res2] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs: [launchConfigs[2]],
      });
      assert.equal(res2.created_launch_configs.length, 0);
      assert.equal(res2.updated_launch_configs.length, 1);
      assert.equal(res2.archived_launch_configs.length, 2);
      assertEqualSorted(res.created_launch_configs, [...res2.archived_launch_configs, ...res2.updated_launch_configs]);

      const [res3] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs: [launchConfigs[0], launchConfigs[1]],
      });
      assert.equal(res3.created_launch_configs.length, 0);
      assert.equal(res3.updated_launch_configs.length, 2);
      assert.equal(res3.archived_launch_configs.length, 1);
      assertEqualSorted(res.created_launch_configs, [...res3.archived_launch_configs, ...res3.updated_launch_configs]);

      const [res4] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs: ['c4', 'c5'],
      });
      assert.equal(res4.created_launch_configs.length, 2);
      assert.equal(res4.updated_launch_configs.length, 0);
      assert.equal(res4.archived_launch_configs.length, 2);

      // should archive all
      const [res5] = await db.fns.upsert_worker_pool_launch_configs('wp/id', {
        launchConfigs: [],
      });
      assert.equal(res5.created_launch_configs.length, 0);
      assert.equal(res5.updated_launch_configs.length, 0);
      assert.equal(res5.archived_launch_configs.length, 2);
    });

    helper.dbTest('expire_worker_pool_launch_configs', async function (db) {
      // make sure all previous launch configs are expired
      await db.fns.expire_worker_pool_launch_configs();

      const wpId = 'w/i2';
      const isArchived = true;
      await db.fns.create_worker_pool_launch_config('lc1', wpId, isArchived, { config: '1' }, fromNow('0s'), fromNow('0s'));
      await db.fns.create_worker_pool_launch_config('lc2', wpId, isArchived, { config: '2' }, fromNow('0s'), fromNow('0s'));
      await create_worker(db, {
        worker_id: 'f1',
        worker_pool_id: wpId,
        launch_config_id: 'lc2',
      }); // this should not let lc2 to be removed

      assert.deepEqual(await db.fns.expire_worker_pool_launch_configs(), [{ launch_config_id: 'lc1' }]);

      await db.fns.delete_worker(wpId, 'w/group', 'f1');
      assert.deepEqual(await db.fns.expire_worker_pool_launch_configs(), [{ launch_config_id: 'lc2' }]);
    });

    helper.dbTest('get_worker_pool_launch_config_stats', async function (db) {
      // test stats are being returned for workers groupped by state
    });

  });
});
