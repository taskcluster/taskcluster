const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'purge_cache' });

  const samples = [
    { provisioner_id: 'prov-1', worker_type: 'wt-1', cache_name: 'cache-1', before: fromNow('0 seconds'), expires: fromNow('1 day')},
    { provisioner_id: 'prov-2', worker_type: 'wt-2', cache_name: 'cache-2', before: fromNow('0 seconds'), expires: fromNow('2 days')},
  ];

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from cache_purges');
      await client.query(
        `insert into cache_purges (provisioner_id, worker_type, cache_name, before, expires) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
        samples.flatMap(s => [`${s.provisioner_id}`, `${s.worker_type}`, `${s.cache_name}`, s.before, s.expires]),
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

  helper.dbTest('all_purge_requests', async function(db, isFake) {
    const caches = await db.fns.all_purge_requests(5, 0);
    compare(caches, samples);
  });

  helper.dbTest('all_purge_requests in pages', async function(db, isFake) {
    const size = 1;
    let offset = 0;
    let caches = await db.fns.all_purge_requests(size, offset);
    caches.splice(-1);

    assert.equal(caches.length, 1);
    compare(caches[0], samples[0]);

    offset += 1;
    caches = await db.fns.all_purge_requests(size, offset);
    assert.equal(caches.length, 1);
    compare(caches[0], samples[1]);
  });

  helper.dbTest('purge_cache (create)', async function(db, isFake) {
    const dbFns = isFake ? helper.fakeDb['purge_cache'] : db.fns;
    const sample = { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-3', before: fromNow('0 seconds'), expires: fromNow('1 day')};

    await dbFns.purge_cache(
      sample.provisioner_id,
      sample.worker_type,
      sample.cache_name,
      sample.before, sample.expires,
    );
    const cache = (await dbFns.all_purge_requests(5, 0))
      .find(({ provisioner_id, worker_type, cache_name }) =>
        provisioner_id === sample.provisioner_id &&
        worker_type === sample.worker_type &&
        cache_name === sample.cache_name);

    assert.equal(cache.provisioner_id, sample.provisioner_id);
    assert.equal(cache.worker_type, sample.worker_type);
    assert.equal(cache.cache_name, sample.cache_name);
    assert.equal(cache.before.getTime(), sample.before.getTime());
    assert(!cache.expires);
    assert(!cache.etag);
  });

  helper.dbTest('purge_cache (upsert)', async function(db, isFake) {
    const dbFns = isFake ? helper.fakeDb['purge_cache'] : db.fns;
    const sample = { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-3' };

    await dbFns.purge_cache(sample.provisioner_id, sample.worker_type, sample.cache_name, fromNow('10 seconds'), fromNow('1 day'));
    const cache = (await dbFns.all_purge_requests(5, 0))
      .find(({ provisioner_id, worker_type, cache_name }) =>
        provisioner_id === sample.provisioner_id &&
        worker_type === sample.worker_type &&
        cache_name === sample.cache_name);
    await dbFns.purge_cache(sample.provisioner_id, sample.worker_type, sample.cache_name, fromNow('5 seconds'), fromNow('2 day'));
    const cache2 = (await dbFns.all_purge_requests(5, 0))
      .find(({ provisioner_id, worker_type, cache_name }) =>
        provisioner_id === sample.provisioner_id &&
        worker_type === sample.worker_type &&
        cache_name === sample.cache_name);

    assert.equal(cache.provisioner_id, cache2.provisioner_id);
    assert.equal(cache.worker_type, cache2.worker_type);
    assert.equal(cache.cache_name, cache2.cache_name);
    assert(!cache.etag);
    assert(!cache2.etag);
    assert(!cache.expires);
    assert(!cache2.expires);
    assert(cache.before.getTime());
    assert(cache2.before.getTime());
  });

  helper.dbTest('purge_requests', async function(db, isFake) {
    const dbFns = isFake ? helper.fakeDb['purge_cache'] : db.fns;
    const samples = [
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-3', before: fromNow('4 days'), expires: fromNow('1 day')},
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-4', before: fromNow('6 days'), expires: fromNow('1 day')},
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-5', before: fromNow('8 days'), expires: fromNow('1 day')},
    ];

    for (let i = 0; i < samples.length; i++) {
      await dbFns.purge_cache(
        samples[i].provisioner_id,
        samples[i].worker_type,
        samples[i].cache_name,
        samples[i].before,
        samples[i].expires,
      );
    }

    let entries = await dbFns.purge_requests("prov-3", "wt-3", fromNow('5 days'));
    assert.equal(entries.length, 2);
    compare(entries, [samples[1], samples[2]]);

    entries = await dbFns.purge_requests('prov-3', 'wt-3', fromNow());
    assert.equal(entries.length, 3);

    entries = await dbFns.purge_requests('prov-3', 'wt-3', fromNow('7 days'));
    assert.equal(entries.length, 1);
  });

  helper.dbTest('cache_purges_expires', async function(db, isFake) {
    const dbFns = isFake ? helper.fakeDb['purge_cache'] : db.fns;
    const samples = [
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-3', before: fromNow('4 days'), expires: fromNow('- 1 day')},
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-4', before: fromNow('6 days'), expires: fromNow('- 2 days')},
      { provisioner_id: 'prov-3', worker_type: 'wt-3', cache_name: 'cache-5', before: fromNow('8 days'), expires: fromNow('- 3 days')},
    ];

    for (let i = 0; i < samples.length; i++) {
      await dbFns.purge_cache(
        samples[i].provisioner_id,
        samples[i].worker_type,
        samples[i].cache_name,
        samples[i].before,
        samples[i].expires,
      );
    }

    const count = (await dbFns.cache_purges_expires(fromNow()))[0].cache_purges_expires;

    assert.equal(count, 3);

    const entries = await dbFns.all_purge_requests(5, 0);
    assert.equal(entries.length, 2);
  });
});
