suite('api (client)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:client');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');

  test('ping', async () => {
    await helper.auth.ping();
  });

  test("auth.client (root credentials)", async () => {
    await helper.auth.client('root');
  });

  test("auth.client (no credentials)", async () => {
    await (new helper.Auth()).client('root');
  });
  const CLIENT_ID = 'nobody/sds:ad_asd/df-sAdSfchsdfsdfs';
  test("auth.deleteClient (non-existent)", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientDeleted({
      clientId:  CLIENT_ID
    }));

    await helper.auth.deleteClient(CLIENT_ID);
    await helper.auth.deleteClient(CLIENT_ID);

    await helper.events.waitFor('e1');
  });

  test("auth.deleteClient (invalid root credentials)", async () => {
    await (new helper.Auth({
      clientId:     'root',
      accessToken:  'wrong'
    })).deleteClient(CLIENT_ID).then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

  test("auth.deleteClient (invalid credentials)", async () => {
    await (new helper.Auth({
      clientId:     'wrong-client',
      accessToken:  'no-secret'
    })).deleteClient(CLIENT_ID).then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

  test("auth.createClient (no scopes)", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientCreated({
      clientId:  CLIENT_ID
    }));

    var expires = taskcluster.fromNow('1 hour');
    var description = "Test client...";
    let client = await helper.auth.createClient(CLIENT_ID, {
      expires, description,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(client.accessToken).is.a('string');
    // Has identity scopes
    assume(client.expandedScopes).contains('assume:client-id:' + CLIENT_ID);

    let client2 = await helper.auth.client(CLIENT_ID);
    assume(client2.description).equals(description);
    assume(client2.expires).equals(expires.toJSON());
    assume(client2).has.not.own('accessToken');
    assume(client2.expandedScopes).contains('assume:client-id:' + CLIENT_ID);

    await helper.events.waitFor('e1');
    await helper.auth.deleteClient(CLIENT_ID);
  });

  test("auth.listClients", async() => {
    let suffixes = ['/aa', '/bb', '/bb/1', '/bb/2'];
    await Promise.all(suffixes.map(suffix => 
      helper.auth.createClient(CLIENT_ID + suffix, {
        expires: taskcluster.fromNow('1 hour'),
        description: 'test client',
      })
    ));

    let gotSuffixes = (result) =>
      _.map(_.filter(result,
                     c => c.clientId.startsWith(CLIENT_ID)),
            c => c.clientId.substr(CLIENT_ID.length)).sort();

    // get all clients
    assume(gotSuffixes(await helper.auth.listClients())).to.deeply.equal(suffixes);

    // prefix filtering
    assume(gotSuffixes(await helper.auth.listClients({prefix: CLIENT_ID + '/bb'})))
    .to.deeply.equal(['/bb', '/bb/1', '/bb/2']);
    assume(gotSuffixes(await helper.auth.listClients({prefix: CLIENT_ID + '/bb/'})))
    .to.deeply.equal(['/bb/1', '/bb/2']);
    assume(gotSuffixes(await helper.auth.listClients({prefix: CLIENT_ID + '/c'})))
    .to.deeply.equal([]);

    // clean up
    await Promise.all(suffixes.map(suffix =>
      helper.auth.deleteClient(CLIENT_ID + suffix)
    ));
  });

  test("auth.createClient (with scopes)", async () => {
    await helper.auth.deleteClient(CLIENT_ID);

    await helper.events.listenFor('e1', helper.authEvents.clientCreated({
      clientId:  CLIENT_ID
    }));

    var expires = taskcluster.fromNow('1 hour');
    var description = "Test client...";
    var scopes = ["scope1", "scope2"];
    let client = await helper.auth.createClient(CLIENT_ID, {
      expires, description, scopes,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(client.accessToken).is.a('string');
    assume(client.scopes).contains('scope1');
    assume(client.scopes).contains('scope2');
    assume(client.scopes).not.contains('assume:client-id:' + CLIENT_ID);
    assume(client.expandedScopes).contains('scope1');
    assume(client.expandedScopes).contains('scope2');
    assume(client.expandedScopes).contains('assume:client-id:' + CLIENT_ID);

    let client2 = await helper.auth.client(CLIENT_ID);
    assume(client2.description).equals(description);
    assume(client2.expires).equals(expires.toJSON());
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).contains('scope1');
    assume(client2.scopes).contains('scope2');
    assume(client2.scopes).not.contains('assume:client-id:' + CLIENT_ID);
    assume(client2.expandedScopes).contains('scope1');
    assume(client2.expandedScopes).contains('scope2');
    assume(client2.expandedScopes).contains('assume:client-id:' + CLIENT_ID);

    await helper.events.waitFor('e1');
  });

  test("auth.resetAccessToken", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientUpdated({
      clientId:  CLIENT_ID
    }));

    let client = await helper.auth.resetAccessToken(CLIENT_ID)
    assume(new Date(client.lastRotated).getTime())
      .is.greaterThan(new Date(client.lastModified).getTime());
    assume(client.accessToken).is.a('string');
    assume(client.expandedScopes).contains('assume:client-id:' + CLIENT_ID);
    await helper.events.waitFor('e1');

    let client2 = await helper.auth.client(CLIENT_ID);
    assume(client2.lastRotated).equals(client.lastRotated);
    assume(client2).has.not.own('accessToken');
  });

  test("auth.createRole and use client", async () => {
    // Clean up from any dirty tests
    await helper.auth.deleteRole('client-id:' + CLIENT_ID);

    // Create a new role
    let role = await helper.auth.createRole('client-id:' + CLIENT_ID, {
      description: 'test prefix role',
      scopes: ['myapi:*']
    });

    // Fetch client
    let r1 = await helper.auth.client(CLIENT_ID);

    // Sleep 4 seconds, forcing an update of lastUsed date in test config
    await base.testing.sleep(4000);

    // Reseting the accessToken causes a reload, which re-evaluates whether or
    // not to update the lastDateUsed
    let client = await helper.auth.resetAccessToken(CLIENT_ID);

    // Create testClient
    var testClient = new helper.TestClient({
      baseUrl: helper.testBaseUrl,
      credentials: {
        clientId: CLIENT_ID,
        accessToken: client.accessToken,
      },
    });
    await testClient.resource();

    await base.testing.poll(async () => {
      // Fetch client again and check that lastUsed was updated
      let r2 = await helper.auth.client(CLIENT_ID);
      assume(new Date(r2.lastDateUsed).getTime()).greaterThan(
        new Date(r1.lastDateUsed).getTime()
      );
    });

    await testClient.resource();

    // Fetch client again and check that lastUsed wasn't updated
    let r3 = await helper.auth.client(CLIENT_ID);
    assume(new Date(r3.lastDateUsed).getTime()).equals(
      new Date(r3.lastDateUsed).getTime()
    );

    // Clean up test (just a best effort clean up)
    await helper.auth.deleteRole('client-id:' + CLIENT_ID);
  });

  test("auth.updateClient (no scope changes)", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientUpdated({
      clientId:  CLIENT_ID
    }));

    var expires = new Date();
    let description = 'Different test description...';
    let client = await helper.auth.updateClient(CLIENT_ID, {
      description, expires,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(new Date(client.lastModified).getTime())
      .is.greaterThan(new Date(client.lastRotated).getTime());
    assume(client).has.not.own('accessToken');
    assume(client.scopes).contains('scope1');
    assume(client.scopes).contains('scope2');
    assume(client.expandedScopes).contains('assume:client-id:' + CLIENT_ID);
    await helper.events.waitFor('e1');

    let client2 = await helper.auth.client(CLIENT_ID);
    assume(client2.lastModified).equals(client.lastModified);
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).contains('scope1');
    assume(client2.scopes).contains('scope2');
    assume(client2.expandedScopes).contains('assume:client-id:' + CLIENT_ID);
  });

  test("auth.updateClient (with scope changes)", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientUpdated({
      clientId:  CLIENT_ID
    }));

    var expires = new Date();
    let description = 'Third test description...';
    let scopes = ['scope2', 'scope3'];
    let client = await helper.auth.updateClient(CLIENT_ID, {
      description, expires, scopes
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(new Date(client.lastModified).getTime())
      .is.greaterThan(new Date(client.lastRotated).getTime());
    assume(client).has.not.own('accessToken');
    assume(client.scopes).not.contains('scope1');
    assume(client.scopes).contains('scope2');
    assume(client.scopes).contains('scope3');
    assume(client.expandedScopes).not.contains('scope1');
    assume(client.expandedScopes).contains('scope2');
    assume(client.expandedScopes).contains('scope3');
    assume(client.expandedScopes).contains('assume:client-id:' + CLIENT_ID);
    await helper.events.waitFor('e1');

    let client2 = await helper.auth.client(CLIENT_ID);
    assume(client2.lastModified).equals(client.lastModified);
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).not.contains('scope1');
    assume(client2.scopes).contains('scope2');
    assume(client2.scopes).contains('scope3');
    assume(client2.expandedScopes).not.contains('scope1');
    assume(client2.expandedScopes).contains('scope2');
    assume(client2.expandedScopes).contains('scope3');
    assume(client2.expandedScopes).contains('assume:client-id:' + CLIENT_ID);
  });

  test("auth.disableClient", async () => {
    let client = await helper.auth.disableClient(CLIENT_ID);
    assume(client.disabled).equals(true);
    client = await helper.auth.client(CLIENT_ID);
    assume(client.disabled).equals(true);
    client = await helper.auth.disableClient(CLIENT_ID);
    assume(client.disabled).equals(true);
  });

  test("auth.enableClient", async () => {
    let client = await helper.auth.enableClient(CLIENT_ID);
    assume(client.disabled).equals(false);
    client = await helper.auth.client(CLIENT_ID);
    assume(client.disabled).equals(false);
    client = await helper.auth.enableClient(CLIENT_ID);
    assume(client.disabled).equals(false);
  });

  test("auth.deleteClient", async () => {
    await helper.events.listenFor('e1', helper.authEvents.clientDeleted({
      clientId:  CLIENT_ID
    }));

    await helper.auth.deleteClient(CLIENT_ID);
    await helper.auth.deleteClient(CLIENT_ID);

    await helper.events.waitFor('e1');

    await helper.auth.client(CLIENT_ID).then(() => {
      assert(false, "Expected an error");
    }, err => {
      // Expected error
    });
  });

  let assumeScopesetsEqual = (ss1, ss2) => {
    ss1.scopes.sort();
    ss2.scopes.sort();
    assume(ss1).deeply.equal(ss2);
  }

  test("auth.expandScopes with empty scopeset", async () => {
    assumeScopesetsEqual(await helper.auth.expandScopes({scopes: []}), {scopes: []});
  });

  test("auth.expandScopes with non-expanding scopes", async () => {
    let scopes = ['myapi:a', 'myapi:b'];
    assume(await helper.auth.expandScopes({scopes: scopes}))
    .to.deeply.equal({scopes: scopes});
    assumeScopesetsEqual(await helper.auth.expandScopes({scopes}), {scopes})
  });

  test("auth.expandScopes with expanding scopes", async () => {
    await helper.auth.deleteRole('myrole:a');
    await helper.auth.deleteRole('myrole:b');

    await helper.events.listenFor('role-a', helper.authEvents.roleCreated({
      roleId:  'myrole:a'
    }));
    await helper.events.listenFor('role-b', helper.authEvents.roleCreated({
      roleId:  'myrole:b'
    }));

    await helper.auth.createRole('myrole:a', {
      description: 'test role',
      scopes: ['myapi:a:a', 'myapi:a:b']
    });
    await helper.auth.createRole('myrole:b', {
      description: 'test role',
      scopes: ['assume:myrole:a', 'myapi:b:a']
    });
    await helper.events.waitFor('role-a');
    await helper.events.waitFor('role-b');

    assumeScopesetsEqual(await helper.auth.expandScopes({scopes: [
      'assume:myrole:b',
      'myapi:c',
    ]}), {scopes: [
      'assume:myrole:a',
      'assume:myrole:b',
      'myapi:a:a',
      'myapi:a:b',
      'myapi:b:a',
      'myapi:c'
    ]});

    await helper.auth.deleteRole('myrole:a');
    await helper.auth.deleteRole('myrole:b');
  });

  test("auth.currentScopes with root credentials", async () => {
    assumeScopesetsEqual(await helper.auth.currentScopes(), {scopes: ['*']});
  });

  test("auth.currentScopes with root credentials and authorizedScopes", async () => {
    let auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials: {
        clientId:       'root',
        accessToken:    helper.cfg.app.rootAccessToken,
      },
      authorizedScopes: ['myapi:a', 'myapi:b'],
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:a', 'myapi:b']});
  });

  test("auth.currentScopes with temp credentials", async () => {
    let auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:x', 'myapi:y'],
        credentials:  {
          clientId:       'root',
          accessToken:    helper.cfg.app.rootAccessToken,
        },
      }),
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:x', 'myapi:y']});
  });

  test("auth.currentScopes with temp credentials and authorizedScopes", async () => {
    let auth = new helper.Auth({
      baseUrl:          helper.baseUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry:       taskcluster.fromNow('10 min'),
        scopes:       ['myapi:x', 'myapi:y'],
        credentials:  {
          clientId:       'root',
          accessToken:    helper.cfg.app.rootAccessToken,
        },
      }),
      authorizedScopes: ['myapi:x'],
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:x']});
  });
});
