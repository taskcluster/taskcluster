import { cleanRouteAndParams } from '../src/utils.js';
import testing from 'taskcluster-lib-testing';
import { strict as assert } from 'assert';

suite(testing.suiteName(), function() {
  suite('cleanRouteAndParams', function() {
    test('for a plain route', function() {
      assert.deepEqual(
        cleanRouteAndParams('/ab/cd'),
        ['/ab/cd', [], []]);
    });

    test('for a route with "regular" params', function() {
      assert.deepEqual(
        cleanRouteAndParams('/foo/:foo/bar/:bar'),
        ['/foo/<foo>/bar/<bar>', ['foo', 'bar'], []]);
    });

    test('for a route with an optional param', function() {
      assert.deepEqual(
        cleanRouteAndParams('/foo/:foo/bar/:bar?'),
        ['/foo/<foo>/bar/<bar>', ['foo', 'bar'], ['bar']]);
    });
  });
});
