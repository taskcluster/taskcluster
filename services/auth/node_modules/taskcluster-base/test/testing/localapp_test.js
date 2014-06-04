suite('testing.LocalApp', function() {
  var base      = require('../../');
  var debug     = require('debug')('base:test:testing:localapp');
  var request   = require('superagent-promise');
  var assert    = require('assert');
  var path      = require('path');

  // Create server
  var server = new base.testing.LocalApp({
    command:  path.join(__dirname, '..', 'bin', 'app.js'),
    cwd:      path.join(__dirname, '..'),
    name:     'app.js',
  });

  // Setup server
  var baseUrl   = null;
  setup(function() {
    // Launch server
    return server.launch().then(function(baseUrl_) {
      baseUrl = baseUrl_;
    });
  });

  // Shutdown server
  teardown(function() {
    return server.terminate();
  });

  /** Test that /test works */
  test('/test', function() {
    return request.get(baseUrl + 'test').end().then(function(res) {
      assert(res.text == 'Hello World', "Expected Hello World");
    });
  });

  /** That we can launch the server again */
  test('/test again', function() {
    return request.get(baseUrl + 'test').end().then(function(res) {
      assert(res.text == 'Hello World', "Expected Hello World");
    });
  });

  /** Test that /request-count works */
  test('/request-count', function() {
    return request.get(baseUrl + 'request-count').end().then(function(res) {
      assert(res.text == 'Count: 1', "Expected 1 request count");
    }).then(function() {
      return request.get(baseUrl + 'request-count').end();
    }).then(function(res) {
      assert(res.text == 'Count: 2', "Expected 2 request count");
    }).then(function() {
      return request.get(baseUrl + 'request-count').end();
    }).then(function(res) {
      assert(res.text == 'Count: 3', "Expected 3 request count");
    });
  });

  /** Test that /request-count reset */
  test('/request-count resets', function() {
    return request.get(baseUrl + 'request-count').end().then(function(res) {
      assert(res.text == 'Count: 1', "Expected 1 request count");
    }).then(function() {
      return request.get(baseUrl + 'request-count').end();
    }).then(function(res) {
      assert(res.text == 'Count: 2', "Expected 2 request count");
    }).then(function() {
      return server.terminate().then(function() {
        return server.launch();
      });
    }).then(function() {
      return request.get(baseUrl + 'request-count').end();
    }).then(function(res) {
      assert(res.text == 'Count: 1', "Expected 1 request count");
    }).then(function() {
      return request.get(baseUrl + 'request-count').end();
    }).then(function(res) {
      assert(res.text == 'Count: 2', "Expected 2 request count");
    });
  });
});

