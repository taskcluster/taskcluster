const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  test('expire nothing', async function() {
    const count = (await helper.db.fns.expire_cache_purges(new Date()))[0].expire_cache_purges;
    assume(count).to.equal(0);
  });

  test('expire something', async function() {
    const wpid = 'pid/wt';
    const times = [
      taskcluster.fromNow('-3 hours'),
      taskcluster.fromNow('-2 hours'),
      taskcluster.fromNow('-1 hours'),
      taskcluster.fromNow('0 hours'),
    ];

    await helper.db.fns.purge_cache_wpid(wpid, 'a', times[0], times[1]);
    await helper.db.fns.purge_cache_wpid(wpid, 'b', times[0], times[3]);

    const count = (await helper.db.fns.expire_cache_purges(times[2]))[0].expire_cache_purges;
    assume(count).to.equal(1);

    const caches = await helper.db.fns.all_purge_requests_wpid(5, 0);
    assume(
      caches.find(cache => cache.worker_pool_id === wpid && cache.cache_name === 'a'),
    ).to.equal(undefined);
    assume(caches.find(cache => cache.worker_pool_id === wpid && cache.cache_name === 'b'));
  });
});
