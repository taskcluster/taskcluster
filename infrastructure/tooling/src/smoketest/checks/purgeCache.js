const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.scopeExpression = {
  AllOf: [
    'purge-cache:built-in/succeed:smoketest-cache',
  ],
};

exports.tasks = [];
exports.tasks.push({
  title: 'Purge a cache',
  requires: [],
  provides: [
    'target-purge-cache',
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
