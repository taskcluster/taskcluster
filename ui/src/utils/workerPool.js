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

  if (split.length !== 2) {
    throw new Error(`invalid workerPoolId ${workerPoolId}`);
  }

  return { provisionerId: split[0], workerType: split[1] };
};

export const joinWorkerPoolId = (provisionerId, workerType) => {
  if (typeof provisionerId !== 'string') {
    throw new Error('provisionerId omitted');
  }
  if (typeof workerType !== 'string') {
    throw new Error('workerType omitted');
  }
  if (provisionerId.indexOf('/') !== -1) {
    throw new Error('provisionerId cannot contain `/`');
  }

  return `${provisionerId}/${workerType}`;
};

export const isWorkerPoolIdSecondHalfValid = workerType =>
  /^[a-z]([-a-z0-9]{0,36}[a-z0-9])?$/.test(workerType);
