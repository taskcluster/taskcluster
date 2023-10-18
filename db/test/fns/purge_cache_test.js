import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';
import tc from 'taskcluster-client';
const { fromNow } = tc;
import helper from '../helper.js';

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'purge_cache' });

  const samples = [
    { worker_pool_id: 'prov-1/wt-1', cache_name: 'cache-1', before: fromNow('0 seconds'), expires: fromNow('1 day') },
    { worker_pool_id: 'prov-2/wt-2', cache_name: 'cache-2', before: fromNow('0 seconds'), expires: fromNow('2 days') },
  ];

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from cache_purges');
      await client.query(
        `insert into cache_purges (worker_pool_id, cache_name, before, expires) values ($1, $2, $3, $4), ($5, $6, $7, $8)`,
        samples.flatMap(s => [`${s.worker_pool_id}`, `${s.cache_name}`, s.before, s.expires]),
      );
    });
  });

  function compare(caches, samples) {
    const checkCache = (cache, sample) => {
      assert.equal(cache.worker_pool_id, sample.worker_pool_id);
      assert.equal(cache.cache_name, sample.cache_name);
      assert.equal(cache.before.getTime(), sample.before.getTime());
      if (cache.expires) {
        assert.equal(cache.expires.getTime(), sample.expires.getTime());
      }
    };

    if (caches instanceof Array) {
      caches = caches.sort();
      samples = samples.sort();
      caches.forEach((cache, idx) => {
        checkCache(cache, samples[idx]);
      });
    } else {
      checkCache(caches, samples);
    }
  }

  helper.dbTest('all_purge_requests_wpid', async function(db) {
    const caches = await db.fns.all_purge_requests_wpid(5, 0);
    compare(caches, samples);
  });

  helper.dbTest('all_purge_requests_wpid in pages', async function(db) {
    const size = 1;
    let offset = 0;
    let caches = await db.fns.all_purge_requests_wpid(size, offset);

    assert.equal(caches.length, 1);
    compare(caches[0], samples[0]);

    offset += 1;
    caches = await db.fns.all_purge_requests_wpid(size, offset);
    assert.equal(caches.length, 1);
    compare(caches[0], samples[1]);
  });

  helper.dbTest('purge_cache (create)', async function(db) {
    const sample = { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-3', before: fromNow('0 seconds'), expires: fromNow('1 day') };

    await db.fns.purge_cache_wpid(
      sample.worker_pool_id,
      sample.cache_name,
      sample.before, sample.expires,
    );
    const cache = (await db.fns.all_purge_requests_wpid(5, 0))
      .find(({ worker_pool_id, cache_name }) =>
        worker_pool_id === sample.worker_pool_id &&
        cache_name === sample.cache_name);

    assert.equal(cache.worker_pool_id, sample.worker_pool_id);
    assert.equal(cache.cache_name, sample.cache_name);
    assert.equal(cache.before.getTime(), sample.before.getTime());
    assert(!cache.expires);
    assert(!cache.etag);
  });

  helper.dbTest('purge_cache (upsert)', async function(db) {
    const sample = { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-3' };

    await db.fns.purge_cache_wpid(sample.worker_pool_id, sample.cache_name, fromNow('10 seconds'), fromNow('1 day'));
    const cache = (await db.fns.all_purge_requests_wpid(5, 0))
      .find(({ worker_pool_id, cache_name }) =>
        worker_pool_id === sample.worker_pool_id &&
        cache_name === sample.cache_name);
    await db.fns.purge_cache_wpid(sample.worker_pool_id, sample.cache_name, fromNow('5 seconds'), fromNow('2 day'));
    const cache2 = (await db.fns.all_purge_requests_wpid(5, 0))
      .find(({ worker_pool_id, cache_name }) =>
        worker_pool_id === sample.worker_pool_id &&
        cache_name === sample.cache_name);

    assert.equal(cache.worker_pool_id, cache2.worker_pool_id);
    assert.equal(cache.cache_name, cache2.cache_name);
    assert(!cache.etag);
    assert(!cache2.etag);
    assert(!cache.expires);
    assert(!cache2.expires);
    assert(cache.before.getTime());
    assert(cache2.before.getTime());
  });

  helper.dbTest('purge_requests', async function(db) {
    const samples = [
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-3', before: fromNow('4 days'), expires: fromNow('1 day') },
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-4', before: fromNow('6 days'), expires: fromNow('1 day') },
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-5', before: fromNow('8 days'), expires: fromNow('1 day') },
    ];

    for (let i = 0; i < samples.length; i++) {
      await db.fns.purge_cache_wpid(
        samples[i].worker_pool_id,
        samples[i].cache_name,
        samples[i].before,
        samples[i].expires,
      );
    }

    let entries = await db.fns.purge_requests_wpid("prov-3/wt-3");
    assert.equal(entries.length, 3);
    compare(entries, samples);
  });

  helper.dbTest('expire_cache_purges', async function(db) {
    const samples = [
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-3', before: fromNow('4 days'), expires: fromNow('- 1 day') },
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-4', before: fromNow('6 days'), expires: fromNow('- 2 days') },
      { worker_pool_id: 'prov-3/wt-3', cache_name: 'cache-5', before: fromNow('8 days'), expires: fromNow('- 3 days') },
    ];

    for (let i = 0; i < samples.length; i++) {
      await db.fns.purge_cache_wpid(
        samples[i].worker_pool_id,
        samples[i].cache_name,
        samples[i].before,
        samples[i].expires,
      );
    }

    const count = (await db.fns.expire_cache_purges(fromNow()))[0].expire_cache_purges;

    assert.equal(count, 3);

    const entries = await db.fns.all_purge_requests_wpid(5, 0);
    assert.equal(entries.length, 2);
  });
});
