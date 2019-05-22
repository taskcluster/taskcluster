const assert = require('assert');

/**
 * We consider a "workerTypeName" to be a string of the shape "<provisionerId>/<workerType>".
 * For the most part, this service is concerned only with workerTypeNames, simply treating
 * them as a combined identifier, but when calling other APIs like the queue we must use
 * the constituent parts.
 *
 * These two functions serve to split and join workerTypeNames.
 */
const splitWorkerTypeName = workerTypeName => {
  const split = workerTypeName.split('/');
  assert.equal(split.length, 2, `invalid workerTypeName ${workerTypeName}`);
  return {provisionerId: split[0], workerType: split[1]};
};
exports.splitWorkerTypeName = splitWorkerTypeName;

const joinWorkerTypeName = (provisionerId, workerType) => {
  assert(typeof provisionerId === 'string', 'provisionerId omitted');
  assert(typeof workerType === 'string', 'workerType omitted');
  assert(provisionerId.indexOf('/') === -1, 'provisionerId cannot contain `/`');
  return `${provisionerId}/${workerType}`;
};
exports.joinWorkerTypeName = joinWorkerTypeName;
