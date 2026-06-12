import assert from 'node:assert';
import { APIBuilder } from '../src/index.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  // Create test api
  const builder = new APIBuilder({
    title: 'Test Api',
    description: 'Another test api',
    serviceName: 'test',
    apiVersion: 'v1',
  });

  test('no scopes is OK', () => {
    // doesn't throw
    builder.declare({
      method: 'get',
      route: '/test/:myparam',
      name: 'noScopeOktestEP',
      scopes: null,
      category: 'API Library',
      title: 'Test',
      description: 'Test',
    }, (req, res) => {});
  });

  test('string scope works', () => {
    builder.declare({
      method: 'get',
      route: '/testString/:myparam',
      scopes: 'test:unit',
      name: 'strScopetestEP',
      category: 'API Library',
      title: 'Test',
      description: 'Test',
    }, (req, res) => {});
  });

  test('array of string scope rejected', () => {
    assert.throws(() => {
      builder.declare({
        method: 'get',
        route: '/testArr/:myparam',
        scopes: ['test:unit'],
        name: 'arrayScopeRejectedtestEP',
        category: 'API Library',
        title: 'Test',
        description: 'Test',
      }, (req, res) => {});
    }, /Invalid scope expression/);
  });

  test('array of arrays of scope rejected', () => {
    assert.throws(() => {
      builder.declare({
        method: 'get',
        route: '/testArrArr/:myparam',
        scopes: [[]],
        name: 'arrayOfArraytestEP',
        category: 'API Library',
        title: 'Test',
        description: 'Test',
      }, (req, res) => {});
    }, /Invalid scope expression/);
  });

  test('scope expression not rejected', () => {
    builder.declare({
      method: 'get',
      route: '/testScope/:myparam',
      scopes: { AnyOf: ['something'] },
      name: 'expNotRejectedtestEP',
      category: 'API Library',
      title: 'Test',
      description: 'Test',
    }, (req, res) => {});
  });

  test('scope expression with looping template not rejected', () => {
    builder.declare({
      method: 'get',
      route: '/testScope2/:myparam',
      scopes: { AnyOf: [{ for: 'foo', in: 'bar', each: '<foo>' }] },
      name: 'expLoopNotRejectedtestEP',
      category: 'API Library',
      title: 'Test',
      description: 'Test',
    }, (req, res) => {});
  });
});
