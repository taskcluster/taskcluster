const assert = require('assert');

/**
 * Split a workerPoolId into its deprecated provisionerId/workerPool components.
 */
const splitWorkerPoolId = taskQueueId => {
  const split = taskQueueId.split('/');
  assert.equal(split.length, 2, `invalid taskQueueId ${taskQueueId}`);
  return { provisionerId: split[0], workerType: split[1] };
};
exports.splitWorkerPoolId = splitWorkerPoolId;

/**
 * Join a provisionerId and workerType to make a workerPoolId
 */
const joinWorkerPoolId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};
exports.joinWorkerPoolId = joinWorkerPoolId;
