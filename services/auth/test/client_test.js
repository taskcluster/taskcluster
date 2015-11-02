suite('api (client)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:client');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');

  test('ping', async () => {
    await helper.auth.ping();
  });

  test("auth.client (root credentials)", async () => {
    await helper.auth.client('root');
  });

  test("auth.client (no credentials)", async () => {
    await (new helper.Auth()).client('root');
  });

  test("auth.deleteClient (non-existent)", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientDeleted({
      clientId:  'nobody'
    }));

    await helper.auth.deleteClient('nobody');
    await helper.auth.deleteClient('nobody');

    await helper.events.waitFor('e1');
  });

  test("auth.deleteClient (invalid root credentials)", async () => {
    await (new helper.Auth({
      clientId:     'root',
      accessToken:  'wrong'
    })).deleteClient('nobody').then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

  test("auth.deleteClient (invalid credentials)", async () => {
    await (new helper.Auth({
      clientId:     'wrong-client',
      accessToken:  'no-secret'
    })).deleteClient('nobody').then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

  test("auth.createClient", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientCreated({
      clientId:  'nobody'
    }));

    var expires = new Date();
    var description = "Test client...";
    let client = await helper.auth.createClient('nobody', {
      expires, description,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(client.accessToken).is.a('string');
    // Has identity scopes
    assume(client.expandedScopes).contains('assume:client-id:nobody');

    let client2 = await helper.auth.client('nobody');
    assume(client2.description).equals(description);
    assume(client2.expires).equals(expires.toJSON());
    assume(client2).has.not.own('accessToken');
    assume(client2.expandedScopes).contains('assume:client-id:nobody');

    await helper.events.waitFor('e1');
  });

  test("auth.resetAccessToken", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientUpdated({
      clientId:  'nobody'
    }));

    let client = await helper.auth.resetAccessToken('nobody')
    assume(new Date(client.lastRotated).getTime())
      .is.greaterThan(new Date(client.lastModified).getTime());
    assume(client.accessToken).is.a('string');
    assume(client.expandedScopes).contains('assume:client-id:nobody');
    await helper.events.waitFor('e1');

    let client2 = await helper.auth.client('nobody');
    assume(client2.lastRotated).equals(client.lastRotated);
    assume(client2).has.not.own('accessToken');
  });

  test("auth.createRole and use client", async () => {
    // Clean up from any dirty tests
    await helper.auth.deleteRole('client-id:nobody');

    // Create a new role
    let role = await helper.auth.createRole('client-id:nobody', {
      description: 'test prefix role',
      scopes: ['myapi:*']
    });

    // Fetch client
    let r1 = await helper.auth.client('nobody');

    // Sleep 4 seconds, forcing an update of lastUsed date in test config
    await base.testing.sleep(4000);

    // Reseting the accessToken causes a reload, which re-evaluates whether or
    // not to update the lastDateUsed
    let client = await helper.auth.resetAccessToken('nobody');

    // Create testClient
    var testClient = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId: 'nobody',
        accessToken: client.accessToken,
      },
    });
    await testClient.resource();

    await base.testing.poll(async () => {
      // Fetch client again and check that lastUsed was updated
      let r2 = await helper.auth.client('nobody');
      assume(new Date(r2.lastDateUsed).getTime()).greaterThan(
        new Date(r1.lastDateUsed).getTime()
      );
    });

    await testClient.resource();

    // Fetch client again and check that lastUsed wasn't updated
    let r3 = await helper.auth.client('nobody');
    assume(new Date(r3.lastDateUsed).getTime()).equals(
      new Date(r3.lastDateUsed).getTime()
    );

    // Clean up test (just a best effort clean up)
    await helper.auth.deleteRole('client-id:nobody');
  });

  test("auth.updateClient", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientUpdated({
      clientId:  'nobody'
    }));

    var expires = new Date();
    let description = 'Different test description...';
    let client = await helper.auth.updateClient('nobody', {
      description, expires,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(new Date(client.lastModified).getTime())
      .is.greaterThan(new Date(client.lastRotated).getTime());
    assume(client).has.not.own('accessToken');
    assume(client.expandedScopes).contains('assume:client-id:nobody');
    await helper.events.waitFor('e1');

    let client2 = await helper.auth.client('nobody');
    assume(client2.lastModified).equals(client.lastModified);
    assume(client2).has.not.own('accessToken');
  });


  test("auth.deleteClient", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientDeleted({
      clientId:  'nobody'
    }));

    await helper.auth.deleteClient('nobody');
    await helper.auth.deleteClient('nobody');

    await helper.events.waitFor('e1');

    await helper.auth.client('nobody').then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

});