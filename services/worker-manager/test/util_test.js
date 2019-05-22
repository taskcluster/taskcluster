const assert = require('assert');
const util = require('../src/util');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('workerTypeName', function() {
    test('splitWorkerTypeName for valid workerTypeName', function() {
      assert.deepEqual(util.splitWorkerTypeName('provFoo/wtFoo'),
        {provisionerId: 'provFoo', workerType: 'wtFoo'});
    });

    test('splitWorkerTypeName for invalid workerTypeName', function() {
      assert.throws(() => util.splitWorkerTypeName('noSlashes'), /invalid workerTypeName/);
    });

    test('joinWorkerTypeName for valid inputs', function() {
      assert.equal(util.joinWorkerTypeName('myProv', 'myWt'), 'myProv/myWt');
    });

    test('joinWorkerTypeName for undefined provisionerId', function() {
      assert.throws(() => util.joinWorkerTypeName(undefined, 'myWt'), /provisionerId omitted/);
    });

    test('joinWorkerTypeName for invalid provisionerId', function() {
      assert.throws(() => util.joinWorkerTypeName('a/b', 'myWt'), /provisionerId cannot contain/);
    });

    test('joinWorkerTypeName for undefined workerTypoe', function() {
      assert.throws(() => util.joinWorkerTypeName('myProv', undefined), /workerType omitted/);
    });
  });
});
