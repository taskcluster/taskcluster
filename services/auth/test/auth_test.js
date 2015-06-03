suite('api', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('auth:test:api');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');

  test('ping', async () => {
    await helper.auth.ping();
  });

  test('getCredentials', async () => {
    var result = await helper.auth.getCredentials(
      helper.root.clientId
    );
    assert(result.accessToken === helper.root.accessToken,
           "root accessToken mismatch!");
  });

  test('load scopes', async () => {
    var result = await helper.auth.scopes(
      helper.root.clientId
    );
    assert(result.clientId === helper.root.clientId,
           "root clientId mismatch!");
  });

  test('load client', async () => {
    var result = await helper.auth.client(
      helper.root.clientId
    );
    assert(result.accessToken === helper.root.accessToken,
           "root accessToken mismatch!");
  });

  test('create/modify/resetCredentials/delete client', async () => {
    var clientId = slugid.v4();
    var auth2 = null;
    await helper.auth.createClient(clientId, {
      scopes:       ['auth:*'],
      expires:      new Date(3000, 1, 1), // far out in the future
      name:         "test-client",
      description:  "Client used by automatic tests, file a bug and delete if" +
                    " you ever see this client!"
    });
    // Test that create client is idempotent
    var result = await helper.auth.createClient(clientId, {
      scopes:       ['auth:*'],
      expires:      new Date(3000, 1, 1), // far out in the future
      name:         "test-client",
      description:  "Client used by automatic tests, file a bug and delete if" +
                    " you ever see this client!"
    });
    var accessToken = result.accessToken;
    assert(result.accessToken, "accessToken missing!");
    assert(result.clientId === clientId);
    assert(new Date(result.expires).getTime() ===
           new Date(3000, 1, 1).getTime(), "expires mismatch!");
    assert(result.name === "test-client");

    // Test that  the credentials works
    auth2 = new helper.Auth({
      baseUrl:      helper.baseUrl,
      credentials: {
        clientId:     result.clientId,
        accessToken:  result.accessToken
      }
    });
    var client = await auth2.getCredentials(clientId);
    assert(client.accessToken === result.accessToken);

    // Try to modify cleint
    result = await helper.auth.modifyClient(clientId, {
      scopes:       ['auth:*', 'something-else'],
      expires:      new Date(3000, 1, 2), // far out in the future
      name:         "test-client2",
      description:  "Client used by automatic tests, file a bug and delete if" +
                    " you ever see this client!"
    });
    assert(result.accessToken === accessToken, "Didn't expect accessToken");
    assert(result.clientId === clientId);
    assert(new Date(result.expires).getTime() ===
           new Date(3000, 1, 2).getTime(), "expires mismatch!");
    assert(result.name === "test-client2");

    // Try to reset credentials
    result = await helper.auth.resetCredentials(clientId);
    assert(accessToken !== result.accessToken, "Should have been reset");
    // Test that  the credentials works
    var authNew = new helper.Auth({
      baseUrl:      helper.baseUrl,
      credentials: {
        clientId:     result.clientId,
        accessToken:  result.accessToken
      }
    });
    client = await authNew.getCredentials(clientId);
    assert(client.accessToken === result.accessToken);

    // Check that old credentials don't work anymore
    try {
      await auth2.getCredentials(clientId);
      assert(false, "Should have failed we resetCredentials");
    } catch (err) {
      assert(err.statusCode === 401, "Expect authentication error!");
    }

    // Try deleting client
    await helper.auth.removeClient(clientId);
    // Check that it was indeed removed
    try {
      await helper.auth.getCredentials(clientId);
      assert(false, "Client was deleted");
    } catch(err) {
      assert(err.statusCode === 404, "Expected client to be missing");
    }
  });

  test('list credentials (look for root)', async () => {
    var clients = await helper.auth.listClients();
    assert(clients.some(function(client) {
      return client.clientId === helper.root.clientId;
    }), "Expected root client amongst clients");
    assert(clients.length > 0, "should have at least the root client");
  });

  test('delete all credentials (keep test data clean)', async () => {
    var clients = await helper.auth.listClients();
    await Promise.all(
      clients
        .filter(client => client.clientId !== helper.root.clientId)
        .map(client => helper.auth.removeClient(client.clientId))
    );
  });

  test('exportClients/importClients', async () => {
    // First create client to play with
    var clientId = slugid.v4();
    await helper.auth.createClient(clientId, {
      scopes:       ['nothing-useful'],
      expires:      new Date(3000, 1, 1), // far out in the future
      name:         "exported-test-client",
      description:  "Client used by automatic tests, file a bug and delete if" +
                    " you ever see this client!"
    });

    // Export clients
    var clients = await helper.auth.exportClients();
    assume(clients).has.length(1);
    assume(clients.map(_.property('clientId'))).contains(clientId);
    var client = _.find(clients,  {clientId});
    assume(client).is.ok();
    assume(client.scopes).deep.equals(['nothing-useful']);
    assume(client.name).equals("exported-test-client");

    // Import clients
    var c2 = await helper.auth.importClients(clients);
    assume(c2).deep.equals(clients);
    assume(c2).has.length(1);
    assume(c2.map(_.property('clientId'))).contains(clientId);

    // Delete clientId
    await helper.auth.removeClient(clientId);

    // Export again (test that we have none)
    var c3 = await helper.auth.exportClients();
    assume(c3).has.length(0);

    // Import clients
    var c3 = await helper.auth.importClients(clients);
    assume(c3).deep.equals(clients);
    assume(c3).has.length(1);
    assume(c3.map(_.property('clientId'))).contains(clientId);

    // Export clients
    var c4 = await helper.auth.exportClients();
    assume(c4).has.length(1);
    assume(c4.map(_.property('clientId'))).contains(clientId);
    assume(c4).deep.equals(clients);
  });
});