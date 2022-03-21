import {
  joinWorkerPoolId,
  splitWorkerPoolId,
  isWorkerPoolIdSecondHalfValid,
} from './workerPool';

it('should joinWorkerPoolId', () => {
  expect(joinWorkerPoolId('a', 'b')).toEqual('a/b');
});

it('should splitWorkerPoolId', () => {
  expect(splitWorkerPoolId('a/b')).toEqual({
    provisionerId: 'a',
    workerType: 'b',
  });
});

it('should isWorkerPoolIdSecondHalfValid', () => {
  expect(isWorkerPoolIdSecondHalfValid('b')).toEqual(true);

  const len36 = 'a'.repeat(36);

  expect(isWorkerPoolIdSecondHalfValid(`${len36}b`)).toEqual(true);
  expect(isWorkerPoolIdSecondHalfValid(`${len36}-0-0-0-0`)).toEqual(false);
});
