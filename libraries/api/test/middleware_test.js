import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { APIBuilder } from '../src/index.js';

suite(testing.suiteName(), function () {
  test('middleware is exported', function () {
    assert(APIBuilder.middleware);
  });
});
