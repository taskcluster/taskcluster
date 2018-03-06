suite('api/route', function() {
  var assert          = require('assert');
  var Promise         = require('promise');
  var subject         = require('../');
  var express         = require('express');
  var path            = require('path');

  // Create test api
  var api = new subject({
    title:        'Test Api',
    description:  'Another test api',
    name:         'test',
  });

  test('no scopes is OK', function() {
    // doesn't throw
    api.declare({
      method:       'get',
      route:        '/test/:myparam',
      name:         'testEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('string scope works', function() {
    api.declare({
      method:       'get',
      route:        '/test/:myparam',
      scopes:       'test:unit',
      name:         'testEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('array of string scope rejected', function() {
    assert.throws(function() {
      api.declare({
        method:       'get',
        route:        '/test/:myparam',
        scopes:       ['test:unit'],
        name:         'testEP',
        title:        'Test',
        description:  'Test',
      }, function(req, res) {});
    }, /Invalid scope expression/);
  });

  test('array of arrays of scope rejected', function() {
    assert.throws(function() {
      api.declare({
        method:       'get',
        route:        '/test/:myparam',
        scopes:       [[]],
        name:         'testEP',
        title:        'Test',
        description:  'Test',
      }, function(req, res) {});
    }, /Invalid scope expression/);
  });

  test('scope expression not rejected', function() {
    api.declare({
      method:       'get',
      route:        '/test/:myparam',
      scopes:       {AnyOf: ['something']},
      name:         'testEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });

  test('scope expression with looping template not rejected', function() {
    api.declare({
      method:       'get',
      route:        '/test/:myparam',
      scopes:       {AnyOf: [{for: 'foo', in: 'bar', each: '<foo>'}]},
      name:         'testEP',
      title:        'Test',
      description:  'Test',
    }, function(req, res) {});
  });
});
