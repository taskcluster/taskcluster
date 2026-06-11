import { cleanRouteAndParams } from '../src/utils.js';
import testing from '@taskcluster/lib-testing';
import { strict as assert } from 'node:assert';

suite(testing.suiteName(), () => {
  suite('cleanRouteAndParams', () => {
    test('for a plain route', () => {
      assert.deepEqual(
        cleanRouteAndParams('/ab/cd'),
        ['/ab/cd', [], []]);
    });

    test('for a route with "regular" params', () => {
      assert.deepEqual(
        cleanRouteAndParams('/foo/:foo/bar/:bar'),
        ['/foo/<foo>/bar/<bar>', ['foo', 'bar'], []]);
    });

    test('for a route with an optional param', () => {
      assert.deepEqual(
        cleanRouteAndParams('/foo/:foo/bar/:bar?'),
        ['/foo/<foo>/bar/<bar>', ['foo', 'bar'], ['bar']]);
    });
  });
});
