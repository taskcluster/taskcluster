const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'purge_cache' });

  const samples = [
    { provisioner_id: 'prov-1', worker_type: 'wt-1', cache_name: 'cache-1', before: fromNow('0 seconds'), expires: fromNow('1 day')},
    { provisioner_id: 'prov-2', worker_type: 'wt-2', cache_name: 'cache-2', before: fromNow('0 seconds'), expires: fromNow('2 days')}
  ];

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from cache_purges');
      await client.query(
        `insert into cache_purges (provisioner_id, worker_type, cache_name, before, expires) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
        samples.flatMap(s => [`${s.provisioner_id}`, `${s.worker_type}`, `${s.cache_name}`, s.before, s.expires])
      );
    });
    helper.fakeDb['purge_cache'].reset();
    samples.forEach((s) => helper.fakeDb['purge_cache'].purge_cache(s.provisioner_id, s.worker_type, s.cache_name, s.before, s.expires));
  });

  function compare(caches, samples) {
    const checkCache = (cache, sample) => {
      assert.equal(cache.provisioner_id, sample.provisioner_id);
      assert.equal(cache.worker_type, sample.worker_type);
      assert.equal(cache.cache_name, sample.cache_name);
      assert.equal(cache.before.getTime(), sample.before.getTime());
      assert.equal(cache.expires.getTime(), sample.expires.getTime());
    };

    if (caches instanceof Array) {
      caches = caches.sort();
      samples = samples.sort();
      caches.forEach((cache, idx) => {
        checkCache(cache, samples[idx])
      });
    } else {
      checkCache(caches, samples)
    }
  }

  helper.dbTest('cache_purges_load', async function(db, isFake) {
    const [cache] = await db.fns.cache_purges_load(samples[0].provisioner_id, samples[0].worker_type, samples[0].cache_name);
    compare(cache, samples[0]);
  });

  helper.dbTest('cache_purges_load (no match)', async function(db, isFake) {
    const [cache] = await db.fns.cache_purges_load('no-match', samples[0].worker_type, samples[0].cache_name);
    assert(!cache);
  });

  helper.dbTest('all_purge_requests', async function(db, isFake) {
    const caches = await db.fns.all_purge_requests(5, 0);
    compare(caches, samples);
  });

  helper.dbTest('all_purge_requests in pages', async function(db, isFake) {
    const size = 1;
    let page = 0;
    let caches = await db.fns.all_purge_requests(size, page);
    caches.splice(-1);

    assert.equal(caches.length, 1);
    compare(caches[0], samples[0]);

    page += 1;
    caches = await db.fns.all_purge_requests(size, page);
    assert.equal(caches.length, 1);
    compare(caches[0], samples[1]);
  });

  helper.dbTest('purge_cache', async function(db, isFake) {
    const dbFns = isFake ? helper.fakeDb['purge_cache'] : db.fns;
    const sample = { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-3', before: fromNow('0 seconds'), expires: fromNow('1 day')};

    await dbFns.purge_cache(sample.provisioner_id, sample.worker_type, sample.cache_name, sample.before, sample.expires, false);
    const cache = (await dbFns.all_purge_requests(5, 0)).find(({ provisioner_id, worker_type, cache_name }) => provisioner_id === sample.provisioner_id && worker_type ===  sample.worker_type && cache_name === sample.cache_name);

    assert.equal(cache.provisioner_id, sample.provisioner_id);
    assert.equal(cache.worker_type, sample.worker_type);
    assert.equal(cache.cache_name, sample.cache_name);
    assert.equal(cache.before.getTime(), sample.before.getTime());
    assert.equal(cache.expires.getTime(), sample.expires.getTime());
    assert(cache.etag);
  });
});
