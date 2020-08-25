const assert = require('assert');
const util = require('../src/util');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('workerPoolId', function() {
    test('splitWorkerPoolId for valid workerPoolId', function() {
      assert.deepEqual(util.splitWorkerPoolId('provFoo/wtFoo'),
        { provisionerId: 'provFoo', workerType: 'wtFoo' });
    });

    test('splitWorkerPoolId for invalid workerPoolId', function() {
      assert.throws(() => util.splitWorkerPoolId('noSlashes'), /invalid workerPoolId/);
    });

    test('joinWorkerPoolId for valid inputs', function() {
      assert.equal(util.joinWorkerPoolId('myProv', 'myWt'), 'myProv/myWt');
    });

    test('joinWorkerPoolId for undefined provisionerId', function() {
      assert.throws(() => util.joinWorkerPoolId(undefined, 'myWt'), /provisionerId omitted/);
    });

    test('joinWorkerPoolId for invalid provisionerId', function() {
      assert.throws(() => util.joinWorkerPoolId('a/b', 'myWt'), /provisionerId cannot contain/);
    });

    test('joinWorkerPoolId for undefined workerTypoe', function() {
      assert.throws(() => util.joinWorkerPoolId('myProv', undefined), /workerType omitted/);
    });
  });
});
