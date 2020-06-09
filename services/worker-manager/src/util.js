const assert = require('assert');
const taskcluster = require('taskcluster-client');

/**
 * We consider a "workerPoolId" to be a string of the shape "<provisionerId>/<workerType>".
 * For the most part, this service is concerned only with workerPoolIds, simply treating
 * them as a combined identifier, but when calling other APIs like the queue we must use
 * the constituent parts.
 *
 * These two functions serve to split and join workerPoolIds.
 */
const splitWorkerPoolId = workerPoolId => {
  const split = workerPoolId.split('/');
  assert.equal(split.length, 2, `invalid workerPoolId ${workerPoolId}`);
  return {provisionerId: split[0], workerType: split[1]};
};
exports.splitWorkerPoolId = splitWorkerPoolId;

const joinWorkerPoolId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};
exports.joinWorkerPoolId = joinWorkerPoolId;
exports.MAX_MODIFY_ATTEMPTS = 5;

const createCredentials = (worker, expires, cfg) => {
  return taskcluster.createTemporaryCredentials({
    clientId: `worker/${worker.providerId}/${worker.workerPoolId}/${worker.workerGroup}/${worker.workerId}`,
    scopes: [
      `assume:worker-type:${worker.workerPoolId}`, // deprecated role
      `assume:worker-pool:${worker.workerPoolId}`,
      `assume:worker-id:${worker.workerGroup}/${worker.workerId}`,
      `queue:worker-id:${worker.workerGroup}/${worker.workerId}`,
      `secrets:get:worker-type:${worker.workerPoolId}`, // deprecated secret name
      `secrets:get:worker-pool:${worker.workerPoolId}`,
      `queue:claim-work:${worker.workerPoolId}`,
      `worker-manager:remove-worker:${worker.workerPoolId}/${worker.workerGroup}/${worker.workerId}`,
      `worker-manager:reregister-worker:${worker.workerPoolId}/${worker.workerGroup}/${worker.workerId}`,
    ],
    start: taskcluster.fromNow('-15 minutes'),
    expiry: expires,
    credentials: cfg.taskcluster.credentials,
  });
};
exports.createCredentials = createCredentials;
