suite('mockAuthServer', function() {
  var taskcluster     = require('../');
  var assert          = require('assert');
  var mockAuthServer  = require('./mockauthserver');

  var _server = null;
  setup(function() {
    return mockAuthServer({port: 62351}).then(function(server) {
      _server = server;
    });
  });
  teardown(function() {
    return _server.terminate().then(function() {
      _server = null;
    });
  });

  test('getCredentials', function() {
    var reference = mockAuthServer.api.reference({
      baseUrl: 'http://localhost:62351'
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
    var reference = mockAuthServer.api.reference({
      baseUrl: 'http://localhost-wrong-base-url:62351'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:     'test-client',
        accessToken:  'test-token'
      },
      baseUrl:        'http://localhost:62351'
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(client.clientId === 'test-client', "Expected clientId");
    });
  });

  test('getCredentials using delegation', function() {
    var reference = mockAuthServer.api.reference({
      baseUrl: 'http://localhost:62351'
    });
    var Auth = new taskcluster.createClient(reference);
    var auth = new Auth({
      credentials: {
        clientId:     'delegating-client',
        accessToken:  'test-token',
        delegating:   true,
        scopes:       ['auth:credentials']
      }
    });
    // Inspect the credentials
    return auth.getCredentials('test-client').then(function(client) {
      assert(client.clientId === 'test-client', "Expected clientId");
    });
  });
});