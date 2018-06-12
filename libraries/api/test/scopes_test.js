const assert          = require('assert');
const APIBuilder      = require('../');

suite('api/route', function() {
  // Create test api
  const builder = new APIBuilder({
    title:        'Test Api',
    description:  'Another test api',
    serviceName:  'test',
    version:      'v1',
  });

  test('no scopes is OK', function() {
    // doesn't throw
    builder.declare({
      method:       'get',
      route:        '/test/:myparam',
      name:         'noScopeOktestEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('string scope works', function() {
    builder.declare({
      method:       'get',
      route:        '/testString/:myparam',
      scopes:       'test:unit',
      name:         'strScopetestEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('array of string scope rejected', function() {
    assert.throws(function() {
      builder.declare({
        method:       'get',
        route:        '/testArr/:myparam',
        scopes:       ['test:unit'],
        name:         'arrayScopeRejectedtestEP',
        title:        'Test',
        description:  'Test',
      }, function(req, res) {});
    }, /Invalid scope expression/);
  });

  test('array of arrays of scope rejected', function() {
    assert.throws(function() {
      builder.declare({
        method:       'get',
        route:        '/testArrArr/:myparam',
        scopes:       [[]],
        name:         'arrayOfArraytestEP',
        title:        'Test',
        description:  'Test',
      }, function(req, res) {});
    }, /Invalid scope expression/);
  });

  test('scope expression not rejected', function() {
    builder.declare({
      method:       'get',
      route:        '/testScope/:myparam',
      scopes:       {AnyOf: ['something']},
      name:         'expNotRejectedtestEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('scope expression with looping template not rejected', function() {
    builder.declare({
      method:       'get',
      route:        '/testScope2/:myparam',
      scopes:       {AnyOf: [{for: 'foo', in: 'bar', each: '<foo>'}]},
      name:         'expLoopNotRejectedtestEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });
});
