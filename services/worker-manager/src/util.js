import { hrtime } from 'process';
import assert from 'assert';
import taskcluster from '@taskcluster/client';

/**
 * We consider a "workerPoolId" to be a string of the shape "<provisionerId>/<workerType>".
 * For the most part, this service is concerned only with workerPoolIds, simply treating
 * them as a combined identifier, but when calling other APIs like the queue we must use
 * the constituent parts.
 *
 * These two functions serve to split and join workerPoolIds.
 */
export const splitWorkerPoolId = workerPoolId => {
  const split = workerPoolId.split('/');
  assert.equal(split.length, 2, `invalid workerPoolId ${workerPoolId}`);
  return { provisionerId: split[0], workerType: split[1] };
};

export const joinWorkerPoolId = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};

export const MAX_MODIFY_ATTEMPTS = 5;

// We use these fields from inside the worker rather than
// what was passed in the endpoint arguments because that is the thing we have verified
// to be passing in the token. This helps avoid slipups later
// like if we had a scope based on workerGroup alone which we do
// not verify here
export const createCredentials = (worker, expires, cfg) => {
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

const PAYLOAD_SENSITIVE_KEYS = ['workerIdentityProof'];
// remove sensitive keys from the request payload that would be safe for logging
export const sanitizeRegisterWorkerPayload = (obj = {}) => {
  return Object.keys(obj).reduce((res, key) => {
    if (PAYLOAD_SENSITIVE_KEYS.includes(key)) {
      res[key] = '*';
    } else {
      res[key] = obj[key];
    }
    return res;
  }, {});
};

/**
 * Start measuring execution time and return a function
 * that returns the time elapsed since the start.
 *
 * The precision argument is used to control the result units
 * 1e6 (default) for milliseconds
 * 1e9 for seconds
 *
 * @example
 *   const time = measureTime();
 *   operation();
 *   const total = time();
 * @param {number} precision 1e6, 1e9, etc
 */
export const measureTime = (precision = 1e6) => {
  const start = hrtime.bigint();
  return () => Number(hrtime.bigint() - start) / precision;
};
