suite('mockAuthServer', function() {
  var base            = require('taskcluster-base');
  var taskcluster     = require('../');
  var assert          = require('assert');
  var path            = require('path');
  var debug           = require('debug')('test:client_test');

  // Ensure the client is removed from the require cache so it can be reloaded
  // from scratch.
  function getNewClient() {
    // This is an absolute path to the client.js file. If this file is moved
    // then this obviously will break.
    var clientPath = path.resolve(__dirname, '..', 'client.js');
    delete require.cache[clientPath];
    return require(clientPath);
  }

  var _server = null;
  setup(function() {
    return base.testing.createMockAuthServer({
      port:     62351,
      clients: [
        {
          clientId:     'test-client',
          accessToken:  'test-token',
          scopes:       ['auth:credentials'],
          expires:      new Date(2092, 0, 0, 0, 0, 0, 0)
        }
      ]
    }).then(function(server) {
      _server = server;
    });
  });

  teardown(function() {
    return _server.terminate().then(function() {
      _server = null;
    });
  });


  test('getCredentials', function() {
    var reference = base.testing.createMockAuthServer.mockAuthApi.reference({
      baseUrl: 'http://localhost:62351/v1'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      }
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(client.clientId === 'test-client', "Expected clientId");
    });
  });

  test('getCredentials w. baseUrl option', function() {
    var reference = base.testing.createMockAuthServer.mockAuthApi.reference({
      baseUrl: 'http://localhost-wrong-base-url:62351/v1'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      },
      baseUrl:        'http://localhost:62351/v1'
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(client.clientId === 'test-client', "Expected clientId");
    });
  });

  test('getCredentials using authorizedScopes', function() {
    var reference = base.testing.createMockAuthServer.mockAuthApi.reference({
      baseUrl: 'http://localhost:62351/v1'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:       'test-client',
        accessToken:    'test-token',
      },
      authorizedScopes: ['auth:credentials']
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(client.clientId === 'test-client', "Expected clientId");
    });
  });

  test('getCredentials using authorizedScopes (unauthorized)', function() {
    var reference = base.testing.createMockAuthServer.mockAuthApi.reference({
      baseUrl: 'http://localhost:62351/v1'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:       'test-client',
        accessToken:    'test-token',
      },
      authorizedScopes: ['scope-not-authorized']
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(false, "Expected and error");
    }, function(err) {
      debug("Got expected error: %s", err);
      assert(err, "Expected an error");
    });
  });

  suite('getCredentials with environment variables', function() {
    var ACCESS_TOKEN = process.env.TASKCLUSTER_ACCESS_TOKEN,
        CLIENT_ID = process.env.TASKCLUSTER_CLIENT_ID;

    // Be a good citizen and cleanup after this test so we don't leak state.
    teardown(function() {
      process.env.TASKCLUSTER_CLIENT_ID    = CLIENT_ID;
      process.env.TASKCLUSTER_ACCESS_TOKEN = ACCESS_TOKEN;
    });

    test('implicit credentials', function() {
      process.env.TASKCLUSTER_CLIENT_ID    = 'test-client';
      process.env.TASKCLUSTER_ACCESS_TOKEN = 'test-token';

      var reference = base.testing.createMockAuthServer.mockAuthApi.reference({
        baseUrl: 'http://localhost:62351/v1'
      });

      var Auth = new getNewClient().createClient(reference);
      var auth = new Auth();

      return auth.getCredentials('test-client').then(function(client) {
        assert(client.clientId === 'test-client', "Expected clientId");
      });
    });
  });
});
