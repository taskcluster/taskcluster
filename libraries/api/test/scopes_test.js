suite("api/route", function() {
  var assert          = require('assert');
  var Promise         = require('promise');
  var subject         = require('../');
  var express         = require('express');
  var path            = require('path');


  // Create test api
  var api = new subject({
    title:        "Test Api",
    description:  "Another test api"
  });

  test("no scopes is OK", function() {
    // doesn't throw
    api.declare({
        method:       'get',
        route:        '/test/:myparam',
        name:         'testEP',
        title:        "Test",
        description:  "Test",
    }, function(req, res) {});
  });

  test("string scope rejected", function() {
   assert.throws(function() {
      api.declare({
          method:       'get',
          route:        '/test/:myparam',
          scopes:       'test:unit',
          name:         'testEP',
          title:        "Test",
          description:  "Test",
      }, function(req, res) {})
    }, /array of arrays of strings/);
  });

  test("array of string scope rejected", function() {
   assert.throws(function() {
      api.declare({
          method:       'get',
          route:        '/test/:myparam',
          scopes:       ['test:unit'],
          name:         'testEP',
          title:        "Test",
          description:  "Test",
      }, function(req, res) {})
    }, /array of arrays of strings/);
  });

  test("array of arrays of objects scope rejected", function() {
   assert.throws(function() {
      api.declare({
          method:       'get',
          route:        '/test/:myparam',
          scopes:       [[{}]],
          name:         'testEP',
          title:        "Test",
          description:  "Test",
      }, function(req, res) {})
    }, /array of arrays of strings/);
  });
});
