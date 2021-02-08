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
