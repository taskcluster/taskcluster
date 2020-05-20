const assert = require('assert').strict;
const helper = require('./helper');
const _ = require('lodash');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), ['db', 'azure', 'gcp'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServers(mock, skipping);

  test('ping', async () => {
    await helper.apiClient.ping();
  });

  test('auth.client (root credentials)', async () => {
    await helper.apiClient.client('static/taskcluster/root');
  });

  test('auth.client (no credentials)', async () => {
    await helper.apiClient.client('static/taskcluster/root');
    await (new helper.AuthClient({
      rootUrl: helper.rootUrl,
    })).client('static/taskcluster/root');
  });

  const CLIENT_ID = 'nobody/sds:ad_asd/df-sAdSfchsdfsdfs';
  test('auth.deleteClient (non-existent)', async () => {
    await helper.apiClient.deleteClient(CLIENT_ID);
    helper.assertPulseMessage('client-deleted', m => m.payload.clientId === CLIENT_ID);
  });

  test('auth.deleteClient (invalid root credentials)', async () => {
    await (new helper.AuthClient({
      rootUrl: helper.rootUrl,
      clientId: 'static/taskcluster/root',
      accessToken: 'wrong',
    })).deleteClient(CLIENT_ID).then(() => {
      assert(false, 'Expected an error');
      helper.assertNoPulseMessage();
    }, err => {
    });
  });

  test('auth.deleteClient (invalid credentials)', async () => {
    await (new helper.AuthClient({
      rootUrl: helper.rootUrl,
      clientId: 'wrong-client',
      accessToken: 'no-secret',
    })).deleteClient(CLIENT_ID).then(() => {
      assert(false, 'Expected an error');
      helper.assertNoPulseMessage();
    }, err => {
      // Expected error
    });
  });

  test('auth.createClient (no scopes)', async () => {
    let expires = taskcluster.fromNow('1 hour');
    let description = 'Test client...';
    let client = await helper.apiClient.createClient(CLIENT_ID, {
      expires, description,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(client.accessToken).is.a('string');
    // Has identity scopes
    assume(client.expandedScopes).to.deeply.equal([]);

    let client2 = await helper.apiClient.client(CLIENT_ID);
    assume(client2.description).equals(description);
    assume(client2.expires).equals(expires.toJSON());
    assume(client2).has.not.own('accessToken');
    assume(client2.expandedScopes).to.deeply.equal([]);

    helper.assertPulseMessage('client-created', m => m.payload.clientId === CLIENT_ID);
    await helper.apiClient.deleteClient(CLIENT_ID);
  });

  test('auth.createClient (with scopes)', async () => {
    let expires = taskcluster.fromNow('1 hour');
    let description = 'Test client...';
    let scopes = ['scope1', 'myapi:*'];
    let client = await helper.apiClient.createClient(CLIENT_ID, {
      expires, description, scopes,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(client.accessToken).is.a('string');
    assume(client.scopes).contains('scope1');
    assume(client.scopes).contains('myapi:*');
    assume(client.expandedScopes).contains('scope1');
    assume(client.expandedScopes).contains('myapi:*');

    let client2 = await helper.apiClient.client(CLIENT_ID);
    assume(client2.description).equals(description);
    assume(client2.expires).equals(expires.toJSON());
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).contains('scope1');
    assume(client2.scopes).contains('myapi:*');
    assume(client2.expandedScopes).contains('scope1');
    assume(client2.expandedScopes).contains('myapi:*');
    // we don't use assume:client-id anymore (bug 1220686)
    assume(client2.scopes).not.contains('assume:client-id:' + CLIENT_ID);
    assume(client2.expandedScopes).not.contains('assume:client-id:' + CLIENT_ID);

    helper.assertPulseMessage('client-created', m => m.payload.clientId === CLIENT_ID);
  });

  test('create client but pulse publish fails', async () => {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({retries: 0});
    const expires = taskcluster.fromNow('1 hour');
    const payload = {expires, description: 'client', scopes: ['scope1:']};
    await assert.rejects(
      () => apiClient.createClient(CLIENT_ID, payload),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();

    helper.onPulsePublish(); // don't fail to publish this time

    // this should be an idempotent create operation
    const res = await apiClient.createClient(CLIENT_ID, payload);
    assert.equal(res.clientId, CLIENT_ID);
  });

  test('create client with a **-scope', async () => {
    try {
      await helper.apiClient.createClient(CLIENT_ID, {
        expires: taskcluster.fromNow('1 hour'),
        description: 'client',
        scopes: ['scope1:**'],
      });
    } catch (err) {
      assert.equal(err.code, 'InputError');
      return;
    }
    assert(false, 'Expected an error');
  });

  const createTestClient = async () => {
    let expires = taskcluster.fromNow('1 hour');
    let description = 'Test client...';
    let scopes = ['scope1', 'myapi:*'];
    await helper.apiClient.createClient(CLIENT_ID, {
      expires, description, scopes,
    });

    helper.assertPulseMessage('client-created', m => m.payload.clientId === CLIENT_ID);
  };

  test('auth.resetAccessToken', async () => {
    await createTestClient();
    let client = await helper.apiClient.resetAccessToken(CLIENT_ID);
    assume(new Date(client.lastRotated).getTime())
      .is.greaterThan(new Date(client.lastModified).getTime());
    assume(client.accessToken).is.a('string');
    helper.assertPulseMessage('client-updated', m => m.payload.clientId === CLIENT_ID);

    let client2 = await helper.apiClient.client(CLIENT_ID);
    assume(client2.lastRotated).equals(client.lastRotated);
    assume(client2).has.not.own('accessToken');
  });

  test('use client', async () => {
    await createTestClient();

    // Fetch client
    let r1 = await helper.apiClient.client(CLIENT_ID);

    // Sleep 4 seconds, forcing an update of lastUsed date in test config
    await testing.sleep(4000);

    // Reseting the accessToken causes a reload, which re-evaluates whether or
    // not to update the lastDateUsed
    let client = await helper.apiClient.resetAccessToken(CLIENT_ID);

    // Create testClient
    let testClient = new helper.TestClient({
      rootUrl: helper.rootUrl,
      credentials: {
        clientId: CLIENT_ID,
        accessToken: client.accessToken,
      },
    });
    await testClient.resource();

    await testing.poll(async () => {
      // Fetch client again and check that lastUsed was updated
      let r2 = await helper.apiClient.client(CLIENT_ID);
      assume(new Date(r2.lastDateUsed).getTime()).greaterThan(
        new Date(r1.lastDateUsed).getTime(),
      );
    });

    await testClient.resource();

    // Fetch client again and check that lastUsed wasn't updated
    let r3 = await helper.apiClient.client(CLIENT_ID);
    assume(new Date(r3.lastDateUsed).getTime()).equals(
      new Date(r3.lastDateUsed).getTime(),
    );
  });

  test('auth.updateClient (no scope changes)', async () => {
    await createTestClient();

    let expires = new Date();
    let description = 'Different test description...';
    let client = await helper.apiClient.updateClient(CLIENT_ID, {
      description, expires,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(new Date(client.lastModified).getTime())
      .is.greaterThan(new Date(client.lastRotated).getTime());
    assume(client).has.not.own('accessToken');
    assume(client.scopes).contains('scope1');
    assume(client.scopes).contains('myapi:*');
    assume(client.expandedScopes).contains('scope1');
    assume(client.expandedScopes).contains('myapi:*');
    helper.assertPulseMessage('client-updated', m => m.payload.clientId === CLIENT_ID);

    let client2 = await helper.apiClient.client(CLIENT_ID);
    assume(client2.lastModified).equals(client.lastModified);
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).contains('scope1');
    assume(client2.scopes).contains('myapi:*');
    assume(client2.expandedScopes).contains('scope1');
    assume(client2.expandedScopes).contains('myapi:*');
  });

  test('auth.updateClient (pulse send fails)', async () => {
    await createTestClient();

    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });

    let expires = new Date();
    let description = 'Different test description...';
    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(
      () => apiClient.updateClient(CLIENT_ID, {description, expires}),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
  });

  test('auth.updateClient (with scope changes)', async () => {
    await createTestClient();

    let expires = new Date();
    let description = 'Third test description...';
    let scopes = ['scope2', 'scope3'];
    let client = await helper.apiClient.updateClient(CLIENT_ID, {
      description, expires, scopes,
    });
    assume(client.description).equals(description);
    assume(client.expires).equals(expires.toJSON());
    assume(new Date(client.lastModified).getTime())
      .is.greaterThan(new Date(client.lastRotated).getTime());
    assume(client).has.not.own('accessToken');
    assume(client.scopes).not.contains('scope1');
    assume(client.scopes).contains('scope2');
    assume(client.scopes).contains('scope3');
    assume(client.scopes).not.contains('myapi:*');
    assume(client.expandedScopes).not.contains('scope1');
    assume(client.expandedScopes).contains('scope2');
    assume(client.expandedScopes).contains('scope3');
    assume(client.expandedScopes).not.contains('myapi:*');
    helper.assertPulseMessage('client-updated', m => m.payload.clientId === CLIENT_ID);

    let client2 = await helper.apiClient.client(CLIENT_ID);
    assume(client2.lastModified).equals(client.lastModified);
    assume(client2).has.not.own('accessToken');
    assume(client2.scopes).not.contains('scope1');
    assume(client2.scopes).contains('scope2');
    assume(client2.scopes).contains('scope3');
    assume(client2.expandedScopes).not.contains('scope1');
    assume(client2.expandedScopes).contains('scope2');
    assume(client2.expandedScopes).contains('scope3');
  });

  test('update client adding a **-scope', async () => {
    try {
      await helper.apiClient.updateClient(CLIENT_ID, {
        expires: taskcluster.fromNow('1 hour'),
        description: 'client',
        scopes: ['scope1:**'],
      });
    } catch (err) {
      assert.equal(err.code, 'InputError');
      return;
    }
    assert(false, 'Expected an error');
  });

  test('auth.disableClient / enableClient', async () => {
    await createTestClient();

    let client = await helper.apiClient.disableClient(CLIENT_ID);
    assume(client.disabled).equals(true);
    client = await helper.apiClient.client(CLIENT_ID);
    assume(client.disabled).equals(true);
    client = await helper.apiClient.disableClient(CLIENT_ID);
    assume(client.disabled).equals(true);

    client = await helper.apiClient.enableClient(CLIENT_ID);
    assume(client.disabled).equals(false);
    client = await helper.apiClient.client(CLIENT_ID);
    assume(client.disabled).equals(false);
    client = await helper.apiClient.enableClient(CLIENT_ID);
    assume(client.disabled).equals(false);
  });

  test('auth.deleteClient', async () => {
    await createTestClient();

    await helper.apiClient.deleteClient(CLIENT_ID);
    await helper.apiClient.deleteClient(CLIENT_ID);

    helper.assertPulseMessage('client-deleted', m => m.payload.clientId === CLIENT_ID);

    await helper.apiClient.client(CLIENT_ID).then(() => {
      assert(false, 'Expected an error');
    }, err => {
      // Expected error
    });
  });

  test('auth.deleteClient (pulse publish fails)', async () => {
    await createTestClient();
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });

    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(
      () => apiClient.deleteClient(CLIENT_ID),
      err => err.statusCode === 500);

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
  });

  let assumeScopesetsEqual = (ss1, ss2) => {
    ss1.scopes.sort();
    ss2.scopes.sort();
    assume(ss1).deeply.equal(ss2);
  };

  test('auth.expandScopes with empty scopeset', async () => {
    assumeScopesetsEqual(await helper.apiClient.expandScopes({scopes: []}), {scopes: []});
  });

  test('auth.expandScopes with non-expanding scopes', async () => {
    let scopes = ['myapi:a', 'myapi:b'];
    assume(await helper.apiClient.expandScopes({scopes: scopes}))
      .to.deeply.equal({scopes: scopes});
    assumeScopesetsEqual(await helper.apiClient.expandScopes({scopes}), {scopes});
  });

  test('auth.expandScopes with expanding scopes', async () => {
    await helper.apiClient.createRole('myrole:a', {
      description: 'test role',
      scopes: ['myapi:a:a', 'myapi:a:b'],
    });
    await helper.apiClient.createRole('myrole:b', {
      description: 'test role',
      scopes: ['assume:myrole:a', 'myapi:b:a'],
    });

    helper.assertPulseMessage('role-created', m => m.payload.roleId === 'myrole:a');
    helper.assertPulseMessage('role-created', m => m.payload.roleId === 'myrole:b');

    assumeScopesetsEqual(await helper.apiClient.expandScopes({scopes: [
      'assume:myrole:b',
      'myapi:c',
    ]}), {scopes: [
      'assume:myrole:a',
      'assume:myrole:b',
      'myapi:a:a',
      'myapi:a:b',
      'myapi:b:a',
      'myapi:c',
    ]});
  });

  test('auth.currentScopes with root credentials', async () => {
    assumeScopesetsEqual(await helper.apiClient.currentScopes(), {scopes: ['*']});
  });

  test('auth.currentScopes with root credentials and authorizedScopes', async () => {
    let auth = new helper.AuthClient({
      rootUrl: helper.rootUrl,
      credentials: {
        clientId: 'static/taskcluster/root',
        accessToken: helper.rootAccessToken,
      },
      authorizedScopes: ['myapi:a', 'myapi:b'],
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:a', 'myapi:b']});
  });

  test('auth.currentScopes with temp credentials', async () => {
    let auth = new helper.AuthClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:x', 'myapi:y'],
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: helper.rootAccessToken,
        },
      }),
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:x', 'myapi:y']});
  });

  test('auth.currentScopes with temp credentials and authorizedScopes', async () => {
    let auth = new helper.AuthClient({
      rootUrl: helper.rootUrl,
      credentials: taskcluster.createTemporaryCredentials({
        expiry: taskcluster.fromNow('10 min'),
        scopes: ['myapi:x', 'myapi:y'],
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: helper.rootAccessToken,
        },
      }),
      authorizedScopes: ['myapi:x'],
    });
    assumeScopesetsEqual(await auth.currentScopes(),
      {scopes: ['myapi:x']});
  });

  suite('auth.listClients', function() {
    const suffixes = ['/aa', '/bb', '/bb/1', '/bb/2', '/bb/3', '/bb/4', '/bb/5'];

    setup(async function() {
      if (skipping()) {
        this.skip();
      }
      await Promise.all(suffixes.map(suffix =>
        helper.apiClient.createClient(CLIENT_ID + suffix, {
          expires: taskcluster.fromNow('1 hour'),
          description: 'test client',
        }),
      ));
    });

    const gotSuffixes = (result) =>
      _.map(_.filter(result.clients, c => c.clientId.startsWith(CLIENT_ID)),
        c => c.clientId.substr(CLIENT_ID.length)).sort();

    test('all clients', async () => {
      let clients = await helper.apiClient.listClients();
      assume(gotSuffixes(clients)).to.deeply.equal(suffixes);
    });

    test('prefix filtering', async () => {
      assume(gotSuffixes(await helper.apiClient.listClients({prefix: CLIENT_ID + '/bb'})))
        .to.deeply.equal(['/bb', '/bb/1', '/bb/2', '/bb/3', '/bb/4', '/bb/5']);
      assume(gotSuffixes(await helper.apiClient.listClients({prefix: CLIENT_ID + '/bb/'})))
        .to.deeply.equal(['/bb/1', '/bb/2', '/bb/3', '/bb/4', '/bb/5']);
      assume(gotSuffixes(await helper.apiClient.listClients({prefix: CLIENT_ID + '/c'})))
        .to.deeply.equal([]);
    });

    test('limit / continuationToken', async () => {
      let clients = [];
      let query = {limit: 1};

      while (true) {
        const result = await helper.apiClient.listClients(query);
        assume(result.clients.length).to.be.lessThan(2);
        query.continuationToken = result.continuationToken;
        clients = clients.concat(result.clients);
        if (!query.continuationToken) {
          break;
        }
      }

      assume(gotSuffixes({clients}))
        .to.deeply.equal(['/aa', '/bb', '/bb/1', '/bb/2', '/bb/3', '/bb/4', '/bb/5']);
    });

    test('limit / continuationToken AND prefix filtering', async () => {
      let clients = [];
      let query = {
        limit: 1,
        prefix: CLIENT_ID + '/b',
      };

      // add a few more clients, to keep it interesting
      const moreSuffixes = ['/ads', '/bbbl', '/bc/2', '/aaaa'];

      await Promise.all(moreSuffixes.map(suffix =>
        helper.apiClient.createClient(CLIENT_ID + suffix, {
          expires: taskcluster.fromNow('1 hour'),
          description: 'test client',
        }),
      ));

      while (true) {
        const result = await helper.apiClient.listClients(query);
        assume(result.clients.length).to.be.lessThan(2);
        query.continuationToken = result.continuationToken;
        clients = clients.concat(result.clients);
        if (!query.continuationToken) {
          break;
        }
      }

      assume(gotSuffixes({clients}))
        .to.deeply.equal(['/bb', '/bb/1', '/bb/2', '/bb/3', '/bb/4', '/bb/5', '/bbbl', '/bc/2']);
    });
  });
});
