const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assume = require('assume');

helper.secrets.mockSuite(helper.suiteName(__filename), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);

  test('expire nothing', async function() {
    const count = await helper.CachePurge.expire(new Date());
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

    await helper.CachePurge.create({
      ...wt,
      cacheName: 'a',
      before: times[0],
      expires: times[1]});
    await helper.CachePurge.create({
      ...wt,
      cacheName: 'b',
      before: times[0],
      expires: times[3]});

    const count = await helper.CachePurge.expire(times[2]);
    assume(count).to.equal(1);

    assume(await helper.CachePurge.load({...wt, cacheName: 'a'}, true)).to.equal(null);
    assume(await helper.CachePurge.load({...wt, cacheName: 'b'}, true)).to.not.equal(null);
  });
});
