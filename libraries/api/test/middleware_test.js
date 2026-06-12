import assert from 'node:assert';
import { APIBuilder } from '../src/index.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  test('middleware is exported', () => {
    assert(APIBuilder.middleware);
  });
});
