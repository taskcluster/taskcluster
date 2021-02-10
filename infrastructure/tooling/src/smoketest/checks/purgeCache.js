const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.scopeExpression = {
  AllOf: [
    'purge-cache:built-in/succeed:smoketest-cache',
  ],
};

exports.tasks = [];
exports.tasks.push({
  title: 'Purge a cache (--target purge-cache)',
  requires: [
    'ping-purge-cache',
  ],
  provides: [
    'target-purge-cache',
  ],
  run: async () => {
    let purge = new taskcluster.PurgeCache(taskcluster.fromEnvVars());
    const workerPoolId = 'built-in/succeed';
    const payload = {
      cacheName: 'smoketest-cache',
    };
    await purge.purgeCache(workerPoolId, payload);
    const pretendWorker = await purge.purgeRequests(workerPoolId);
    assert.equal(pretendWorker.requests[0].cacheName, payload.cacheName, "Error");
  },
});
