const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.tasks = [];
exports.tasks.push({
  title: 'Create purge cache smoke test',
  requires: [],
  provides: [
    'purge-cache',
  ],
  run: async () => {
    let purge = new taskcluster.PurgeCache(taskcluster.fromEnvVars());
    const provisionerId = 'built-in';
    const workerType = 'succeed';
    const payload = {
      cacheName: 'smoketest-cache',
    };
    await purge.purgeCache(provisionerId, workerType, payload);
    const pretendWorker = await purge.purgeRequests(provisionerId, workerType);
    assert.equal(pretendWorker.requests[0].cacheName, payload.cacheName, "Error");
  },
});
