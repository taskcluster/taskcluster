import assert from 'assert';
import * as util from '../src/util.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function () {
  suite('workerPoolId', function () {
    test('splitWorkerPoolId for valid workerPoolId', function () {
      assert.deepEqual(util.splitWorkerPoolId('provFoo/wtFoo'),
        { provisionerId: 'provFoo', workerType: 'wtFoo' });
    });

    test('splitWorkerPoolId for invalid workerPoolId', function () {
      assert.throws(() => util.splitWorkerPoolId('noSlashes'), /invalid workerPoolId/);
    });

    test('joinWorkerPoolId for valid inputs', function () {
      assert.equal(util.joinWorkerPoolId('myProv', 'myWt'), 'myProv/myWt');
    });

    test('joinWorkerPoolId for undefined provisionerId', function () {
      assert.throws(() => util.joinWorkerPoolId(undefined, 'myWt'), /provisionerId omitted/);
    });

    test('joinWorkerPoolId for invalid provisionerId', function () {
      assert.throws(() => util.joinWorkerPoolId('a/b', 'myWt'), /provisionerId cannot contain/);
    });

    test('joinWorkerPoolId for undefined workerTypoe', function () {
      assert.throws(() => util.joinWorkerPoolId('myProv', undefined), /workerType omitted/);
    });
  });

  suite('sanitizeRegisterWorkerPayload', function () {
    const testPairs = [
      [{}, {}],
      [{ one: 1, two: '2', arr: [] }, { one: 1, two: '2', arr: [] }],
      [{ one: 1, two: '2', arr: ['secret'] }, { one: 1, two: '2', arr: ['secret'] }],
      [{ workerId: 'mac-m1', workerIdentityProof: { secret: 'noway' } }, { workerId: 'mac-m1', workerIdentityProof: '*' }],
      [{ inner: { workerIdentityProof: 'noway' } }, { inner: { workerIdentityProof: 'noway' } }],
    ];
    testPairs.forEach((pair, i) => test(`sanitizeRegisterWorkerPayload: ${JSON.stringify(pair[1])}`, () => {
      assert.deepEqual(util.sanitizeRegisterWorkerPayload(pair[0]), pair[1]);
    }));
  });

  suite('measureTime', function () {
    test('measureTime returns function that returns total time', function () {
      const start = util.measureTime();
      const total = start();
      assert(total > 0);
    });
    test('measureTime uses different precision', function () {
      const start1 = util.measureTime(1e9);
      const start2 = util.measureTime(1e6);

      const total1 = start1();
      const total2 = start2();
      assert(total1 > 0);
      assert(total2 > 0);
      assert(total2 > total1);
    });
  });
});
