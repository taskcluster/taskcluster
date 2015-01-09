suite('testing.createMockAuthServer', function() {
  var base      = require('../../');
  var debug     = require('debug')('base:test:testing:createMockAuthServer');
  require('superagent-hawk')(require('superagent'));
  var request   = require('superagent-promise');
  var assert    = require('assert');

  var helper  = require('../entity/helper');
  var cfg = helper.loadConfig();

  // Construct map of azure account(s) to use for testing
  var azureAccounts = {};
  azureAccounts[cfg.get('azure:accountName')] = cfg.get('azure:accountKey');

  // Create mock auth server
  var server = null;
  setup(function() {
    return base.testing.createMockAuthServer({
      port: 1207,
      clients: [
        {
          clientId:     'authed-client',
          accessToken:  'test-token',
          scopes:       ['auth:credentials', 'auth:azure-table-access:*'],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }, {
          clientId:     'unauthed-client',
          accessToken:  'test-token',
          scopes:       [],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }
      ],
      azureAccounts:    azureAccounts
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

  test("Can fetch azureTableSAS", function() {
    return request
      .get('http://localhost:1207/v1/azure/' + cfg.get('azure:accountName') +
           '/table/mytable/read-write')
      .hawk({
        id:         'authed-client',
        key:        'test-token',
        algorithm:  'sha256'
      })
      .end().then(function(res) {
        assert(res.ok, "To get SAS for table");
      });
  });
});