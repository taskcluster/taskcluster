suite('api', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('auth:test:api');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var subject     = helper.setup({title: "api-tests"});


  test('ping', function() {
    return subject.auth.ping();
  });

  test('getCredentials', function() {
    return subject.auth.getCredentials(
      subject.root.clientId
    ).then(function(result) {
      assert(result.accessToken === subject.root.accessToken,
             "root accessToken mismatch!");
    });
  });

  test('load scopes', function() {
    return subject.auth.scopes(
      subject.root.clientId
    ).then(function(result) {
      assert(result.clientId === subject.root.clientId,
             "root clientId mismatch!");
    });
  });

  test('load client', function() {
    return subject.auth.client(
      subject.root.clientId
    ).then(function(result) {
      assert(result.accessToken === subject.root.accessToken,
             "root accessToken mismatch!");
    });
  });

  test('create/modify/resetCredentials/delete client', function() {
    var clientId = slugid.v4();
    var accessToken = null;
    var auth2 = null;
    return subject.auth.createClient(clientId, {
      scopes:       ['auth:*'],
      expires:      new Date(3000, 1, 1), // far out in the future
      name:         "test-client",
      description:  "Client used by automatic tests, file a bug and delete if" +
                    " you ever see this client!"
    }).then(function(result) {
      accessToken = result.accessToken;
      assert(result.accessToken, "accessToken missing!");
      assert(result.clientId === clientId);
      assert(new Date(result.expires).getTime() ===
             new Date(3000, 1, 1).getTime(), "expires mismatch!");
      assert(result.name === "test-client");
      // Test that  the credentials works
      auth2 = new subject.Auth({
        baseUrl:      subject.baseUrl,
        credentials: {
          clientId:     result.clientId,
          accessToken:  result.accessToken
        }
      });
      return auth2.getCredentials(clientId).then(function(client) {
        assert(client.accessToken === result.accessToken);
      });
    }).then(function() {
      return subject.auth.modifyClient(clientId, {
        scopes:       ['auth:*', 'something-else'],
        expires:      new Date(3000, 1, 2), // far out in the future
        name:         "test-client2",
        description:  "Client used by automatic tests, file a bug and delete if" +
                      " you ever see this client!"
      });
    }).then(function(result) {
      assert(result.accessToken === accessToken, "Didn't expect accessToken");
      assert(result.clientId === clientId);
      assert(new Date(result.expires).getTime() ===
             new Date(3000, 1, 2).getTime(), "expires mismatch!");
      assert(result.name === "test-client2");
    }).then(function() {
      return subject.auth.resetCredentials(clientId);
    }).then(function(result) {
      assert(accessToken !== result.accessToken, "Should have been reset");
      // Test that  the credentials works
      var authNew = new subject.Auth({
        baseUrl:      subject.baseUrl,
        credentials: {
          clientId:     result.clientId,
          accessToken:  result.accessToken
        }
      });
      return authNew.getCredentials(clientId).then(function(client) {
        assert(client.accessToken === result.accessToken);
      });
    }).then(function() {
      // Check that old credentials don't work anymore
      return auth2.getCredentials(clientId).then(function() {
        assert(false, "Should have failed we resetCredentials");
      }, function(err) {
        assert(err.statusCode === 401, "Expect authentication error!");
      });
    }).then(function() {
      return subject.auth.removeClient(clientId);
    }).then(function() {
      // Check that it was indeed removed
      return subject.auth.getCredentials(clientId).then(function() {
        assert(false, "Client was deleted");
      }, function(err) {
        assert(err.statusCode === 404, "Expected client to be missing");
      });
    });
  });

  test('list credentials (look for root)', function() {
    return subject.auth.listClients().then(function(clients) {
      assert(clients.some(function(client) {
        return client.clientId === subject.root.clientId;
      }), "Expected root client amongst clients");
      assert(clients.length > 0, "should have at least the root client");
    });
  });


  test('azureTableSAS', function() {
    return subject.auth.azureTableSAS(
      subject.testaccount,
      'TestTable'
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
    });
  });


  test('azureTableSAS (allowed table)', function() {
    // Restrict access a bit
    var auth = new subject.Auth({
      baseUrl:          subject.baseUrl,
      credentials:      subject.root,
      authorizedScopes: [
        'auth:azure-table-access:' + subject.testaccount + '/allowedTable'
      ]
    });
    return auth.azureTableSAS(
      subject.testaccount,
      'allowedTable'
    ).then(function(result) {
      assert(typeof(result.sas) === 'string', "Expected some form of string");
      assert(new Date(result.expiry).getTime() > new Date().getTime(),
             "Expected expiry to be in the future");
    });
  });

  test('azureTableSAS (unauthorized table)', function() {
    // Restrict access a bit
    var auth = new subject.Auth({
      baseUrl:          subject.baseUrl,
      credentials:      subject.root,
      authorizedScopes: [
        'auth:azure-table-access:' + subject.testaccount + '/allowedTable'
      ]
    });
    return auth.azureTableSAS(
      subject.testaccount,
      'unauthorizedTable'
    ).then(function(result) {
      assert(false, "Expected an authentication error!");
    }, function(err) {
      assert(err.statusCode == 401, "Expected authorization error!");
    });
  });
});