import { cleanRouteAndParams } from '../src/utils.js';
import testing from '@taskcluster/lib-testing';
import { strict as assert } from 'node:assert';

suite(testing.suiteName(), () => {
  suite('cleanRouteAndParams', () => {
    test('for a plain route', () => {
      assert.deepEqual(cleanRouteAndParams('/ab/cd'), {
        route: '/ab/cd',
        params: [],
        optionalParams: [],
        splatParams: [],
      });
    });

    test('for a route with "regular" params', () => {
      assert.deepEqual(cleanRouteAndParams('/foo/:foo/bar/:bar'), {
        route: '/foo/<foo>/bar/<bar>',
        params: ['foo', 'bar'],
        optionalParams: [],
        splatParams: [],
      });
    });

    test('for a route with an optional param', () => {
      assert.deepEqual(cleanRouteAndParams('/foo/:foo/bar{/:bar}'), {
        route: '/foo/<foo>/bar/<bar>',
        params: ['foo', 'bar'],
        optionalParams: ['bar'],
        splatParams: [],
      });
    });

    test('for a route with a wildcard param', () => {
      assert.deepEqual(cleanRouteAndParams('/foo/:foo/bar/*bar'), {
        route: '/foo/<foo>/bar/<bar>',
        params: ['foo', 'bar'],
        optionalParams: [],
        splatParams: ['bar'],
      });
    });

    test('for a route with an empty wildcard param', () => {
      assert.deepEqual(cleanRouteAndParams('/foo/:foo/bar/{*bar}'), {
        route: '/foo/<foo>/bar/<bar>',
        params: ['foo', 'bar'],
        splatParams: ['bar'],
        optionalParams: [],
      });
    });

    test('for a wildcard param that does not follow a slash', () => {
      assert.deepEqual(cleanRouteAndParams('/foo*bar'), {
        route: '/foo<bar>',
        params: ['bar'],
        optionalParams: [],
        splatParams: ['bar'],
      });
    });

    test('for a route with an escaped colon', () => {
      assert.deepEqual(cleanRouteAndParams('/workers/:workerPoolId\\:/:workerGroup'), {
        route: '/workers/<workerPoolId>:/<workerGroup>',
        params: ['workerPoolId', 'workerGroup'],
        optionalParams: [],
        splatParams: [],
      });
    });
  });
});
