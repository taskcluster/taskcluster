suite('api (roles)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:roles');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');

  test('ping', async () => {
    await helper.auth.ping();
  });

  // Setup a clientId we can play with
  let clientId, accessToken;
  test('createClient', async() => {
    let client = await helper.auth.createClient(slugid.v4(), {
      expires: taskcluster.fromNowJSON('1 day'),
      description: "test client..."
    });
    clientId = client.clientId;
    accessToken = client.accessToken;
  });

  test('createRole (normal)', async() => {
    await helper.events.listenFor('e1', helper.authEvents.roleCreated());

    let role = await helper.auth.createRole('client-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*']
    });
    assume(role.description).equals('test role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(role.scopes).deep.equals(['dummy-scope-1', 'auth:create-role:*']);
    assume(role.expandedScopes).contains('dummy-scope-1');
    assume(role.expandedScopes).contains('auth:create-role:*');

    // Check that it's idempotent
    let role2 = await helper.auth.createRole('client-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*']
    });
    assume(role2).deep.equals(role);

    // Ensure that pulse messages comes, don't check the payload as we can't
    // be sure the tests aren't interfering with each other and I'm too lazy to
    // handle all messages.
    await helper.events.waitFor('e1');

    let client = await helper.auth.client(clientId);
    assume(client.expandedScopes.sort()).deep.equals(
      role.expandedScopes.sort()
    );
  });

  test('createRole (prefix)', async() => {
    let auth = new helper.Auth({
      credentials: {clientId, accessToken}
    });

    let roleId = 'client-id:' + clientId.slice(0, 11) + '*';
    let role = await auth.createRole(roleId, {
      description: 'test prefix role',
      scopes: ['dummy-scope-2']
    });
    assume(role.description).equals('test prefix role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(role.scopes).deep.equals(['dummy-scope-2']);
    assume(role.expandedScopes).contains('dummy-scope-2');

    let client = await helper.auth.client(clientId);
    assume(client.expandedScopes).contains('dummy-scope-1');
    assume(client.expandedScopes).contains('auth:create-role:*');
    assume(client.expandedScopes).contains('dummy-scope-2');
  });

  test('createRole (encodeURIComponent)', async() => {
    // Ensure that encodeURIComponent in client library works...
    let roleId = clientId + "/test ?test=1";
    let role = await helper.auth.createRole(roleId, {
      description: 'test role for werid roleId',
      scopes: ['dummy-scope-2']
    });
    assume(role.roleId).equals(roleId);
    await helper.auth.deleteRole(roleId);
  });

  test('getRole', async() => {
    let role = await helper.auth.role('client-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:client-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2'
    ].sort());
  });

  test('listRoles', async() => {
    let roles = await helper.auth.listRoles();
    assert(roles.some(role => role.roleId === 'client-id:' + clientId));
  });

  test('updateRole (add scope)', async() => {
    await helper.events.listenFor('e1', helper.authEvents.roleUpdated());

    let r1 = await helper.auth.role('client-id:' + clientId);

    await base.testing.sleep(100);

    let r2 = await helper.auth.updateRole('client-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3']
    });
    assume(new Date(r2.lastModified).getTime()).greaterThan(
      new Date(r1.lastModified).getTime()
    );

    let role = await helper.auth.role('client-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:client-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2',
      'dummy-scope-3'
    ].sort());
    await helper.events.waitFor('e1');
  });

  test('updateRole (add scope, requires scope)', async() => {
    let auth = new helper.Auth({
      credentials: {clientId: 'root', accessToken: helper.rootAccessToken},
      authorizedScopes: ['auth:update-role:*']
    });

    // Can update without adding new scopes
    await auth.updateRole('client-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3']
    });

    // Can't add scope without scope
    await auth.updateRole('client-id:' + clientId, {
      description: 'test role',
      scopes: [
        'dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3',
        'dummy-scope-4'
      ]
    }).then(() => assert(false, "Expected an error"), err => {
      assert(err.statusCode === 401);
    });
  });


  test('updateRole (remove scope)', async() => {
    let auth = new helper.Auth({
      credentials: {clientId: 'root', accessToken: helper.rootAccessToken},
      authorizedScopes: ['auth:update-role:*']
    });

    // Can remove scope without scope
    await auth.updateRole('client-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*']
    });

    let role = await auth.role('client-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:client-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2'
    ].sort());
  });

  test('deleteRole', async() => {
    await helper.events.listenFor('e1', helper.authEvents.roleDeleted());

    await helper.auth.deleteRole('client-id:' + clientId);
    await helper.auth.deleteRole('client-id:' + clientId);
    let roleId = 'client-id:' + clientId.slice(0, 11) + '*';
    await helper.auth.deleteRole(roleId);

    await helper.auth.role('client-id:' + clientId).then(() => {
      assert(false, "Expected error");
    }, err => assert(err.statusCode === 404, "Expected 404"));

    // At least one of them should trigger this message
    await helper.events.waitFor('e1');
  });

  test('importClients (clean-up w. deleteClient)', async() => {
    await helper.auth.deleteClient(clientId);

    let accessToken = slugid.v4();
    await helper.auth.importClients([{
      clientId,
      accessToken,
      scopes: ['dummy-scope-1'],
      expires: taskcluster.fromNowJSON('4 hours'),
      name: "Test Client",
      description: "Client used to test import"
    }]);

    let client = await helper.auth.client(clientId);
    assume(client.expandedScopes).contains('dummy-scope-1');

    // clean up
    await helper.auth.deleteRole('client-id:' + clientId);
    await helper.auth.deleteClient(clientId);
  });
});