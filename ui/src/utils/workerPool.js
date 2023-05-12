import assert from 'assert';

/**
 * We consider a "workerPoolId" to be a string
 * of the shape "<provisionerId>/<workerType>".
 * For the most part, this service is concerned
 * only with workerPoolIds, simply treating
 * them as a combined identifier, but when calling
 * other APIs like the queue we must use
 * the constituent parts.
 *
 * These two functions serve to split and join workerPoolIds.
 */
export const splitWorkerPoolId = workerPoolId => {
  const split = workerPoolId.split('/');

  assert.strictEqual(split.length, 2, `invalid workerPoolId ${workerPoolId}`);

  return { provisionerId: split[0], workerType: split[1] };
};


export const joinWorkerPoolId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');

  return `${provisionerId}/${workerType}`;
};

export const isWorkerPoolIdSecondHalfValid = workerType =>
  /^[a-z]([-a-z0-9]{0,36}[a-z0-9])?$/.test(workerType);
