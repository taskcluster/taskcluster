import assert from 'assert';

/**
 * Split a workerPoolId into its deprecated provisionerId/workerPool components.
 */
export const splitWorkerPoolId = taskQueueId => {
  const split = taskQueueId.split('/');
  assert.equal(split.length, 2, `invalid taskQueueId ${taskQueueId}`);
  return { provisionerId: split[0], workerType: split[1] };
};
export default { splitWorkerPoolId };
