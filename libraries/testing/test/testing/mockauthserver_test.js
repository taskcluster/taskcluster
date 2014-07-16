suite('testing.createMockAuthServer', function() {
  var base      = require('../../');
  var debug     = require('debug')('base:test:testing:createMockAuthServer');
  require('superagent-hawk')(require('superagent'));
  var request   = require('superagent-promise');
  var assert    = require('assert');

  // Create mock auth server
  var server = null;
  setup(function() {
    return base.testing.createMockAuthServer({
      port: 1207,
      clients: [
        {
          clientId:     'authed-client',
          accessToken:  'test-token',
          scopes:       ['auth:credentials'],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }, {
          clientId:     'unauthed-client',
          accessToken:  'test-token',
          scopes:       [],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }
      ]
    }).then(function(server_) {
      server = server_;
    });
  });

  // Shutdown server
  teardown(function() {
    return server.terminate();
  });

  test("Can getCredentials w. auth:credentials", function() {
    return request
      .get('http://localhost:1207/v1/client/authed-client/credentials')
      .hawk({
        id:         'authed-client',
        key:        'test-token',
        algorithm:  'sha256'
      })
      .end().then(function(res) {
        assert(res.ok, "Failed to get credentials");
      });
  });

  test("Can't getCredentials without auth:credentials", function() {
    return request
      .get('http://localhost:1207/v1/client/authed-client/credentials')
      .hawk({
        id:         'unauthed-client',
        key:        'test-token',
        algorithm:  'sha256'
      })
      .end().then(function(res) {
        assert(!res.ok, "Request should have failed");
      });
  });
});