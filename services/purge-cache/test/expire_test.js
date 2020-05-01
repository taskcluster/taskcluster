const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);

  test('expire nothing', async function() {
    const count = (await helper.db.fns.expire_cache_purges(new Date()))[0].expire_cache_purges;
    assume(count).to.equal(0);
  });

  test('expire something', async function() {
    const wt = {provisionerId: 'pid', workerType: 'wt'};
    const times = [
      taskcluster.fromNow('-3 hours'),
      taskcluster.fromNow('-2 hours'),
      taskcluster.fromNow('-1 hours'),
      taskcluster.fromNow('0 hours'),
    ];

    await helper.db.fns.purge_cache(wt.provisionerId, wt.workerType, 'a', times[0], times[1]);
    await helper.db.fns.purge_cache(wt.provisionerId, wt.workerType, 'b', times[0], times[3]);

    const count = (await helper.db.fns.expire_cache_purges(times[2]))[0].expire_cache_purges;
    assume(count).to.equal(1);

    const caches = await helper.db.fns.all_purge_requests(5, 0);
    assume(
      caches.find(cache => cache.provisioner_id === wt.provisionerId && cache.worker_type === wt.workerType && cache.cache_name === 'a'),
    ).to.equal(undefined);
    assume(caches.find(cache => cache.provisioner_id === wt.provisionerId && cache.worker_type === wt.workerType && cache.cache_name === 'b'));
  });
});
