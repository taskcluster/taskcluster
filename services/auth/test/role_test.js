suite('api (roles)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:roles');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var testing     = require('taskcluster-lib-testing');
  var taskcluster = require('taskcluster-client');

  test('ping', async () => {
    await helper.auth.ping();
  });

  // Setup a clientId we can play with
  let clientId, accessToken;
  clientId = slugid.v4();
  test('createClient', async () => {
    let client = await helper.auth.createClient(clientId, {
      expires: taskcluster.fromNowJSON('1 day'),
      description: 'test client...',
      scopes: ['assume:thing-id:' + clientId],
    });
    accessToken = client.accessToken;
  });

  test('createRole (normal)', async () => {
    await helper.events.listenFor('e1', helper.authEvents.roleCreated());

    let role = await helper.auth.createRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    assume(role.description).equals('test role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(role.scopes).deep.equals([
      'dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2',
    ]);
    assume(role.expandedScopes).contains('dummy-scope-1');
    assume(role.expandedScopes).contains('auth:create-role:*');

    // Check that it's idempotent
    let role2 = await helper.auth.createRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
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

  test('createRole (prefix)', async () => {
    let auth = new helper.Auth({
      credentials: {clientId, accessToken},
    });

    let roleId = 'thing-id:' + clientId.slice(0, 11) + '*';
    let role = await auth.createRole(roleId, {
      description: 'test prefix role',
      scopes: ['dummy-scope-2'],
    });
    assume(role.description).equals('test prefix role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(role.scopes).deep.equals(['dummy-scope-2']);
    assume(role.expandedScopes).contains('dummy-scope-2');
    assume(role.expandedScopes).does.not.contain('assume:' + roleId);

    let client = await helper.auth.client(clientId);
    assume(client.expandedScopes).contains('dummy-scope-1');
    assume(client.expandedScopes).contains('auth:create-role:*');
    assume(client.expandedScopes).contains('dummy-scope-2');
  });

  test('createRole (encodeURIComponent)', async () => {
    // Ensure that encodeURIComponent in client library works...
    let roleId = clientId + '/test ?test=1';
    let role = await helper.auth.createRole(roleId, {
      description: 'test role for werid roleId',
      scopes: ['dummy-scope-2'],
    });
    assume(role.roleId).equals(roleId);
    await helper.auth.deleteRole(roleId);
  });

  test('createRole introducing a cycle', async () => {
    let role = await helper.auth.createRole('test*', {
      description: 'test*',
      scopes: ['assume:other<..>x'],
    });
    assume(role.roleId).equals('test*');

    helper.auth.createRole('other*', {
      description: 'other*',
      scopes: ['assume:te<..>'],
    }).then(() => assert(false, 'Expected error'),
      err => assert(err.statusCode === 400, 'Expected 400'));

    await helper.auth.deleteRole('test*');
  });

  test('getRole', async () => {
    let role = await helper.auth.role('thing-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:thing-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2',
    ].sort());
  });

  test('listRoles', async () => {
    let roles = await helper.auth.listRoles();
    assert(roles.some(role => role.roleId === 'thing-id:' + clientId));
  });

  test('updateRole (add scope)', async () => {
    await helper.events.listenFor('e1', helper.authEvents.roleUpdated());

    let r1 = await helper.auth.role('thing-id:' + clientId);

    await testing.sleep(100);

    let r2 = await helper.auth.updateRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3'],
    });
    assume(new Date(r2.lastModified).getTime()).greaterThan(
      new Date(r1.lastModified).getTime()
    );

    let role = await helper.auth.role('thing-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:thing-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2',
      'dummy-scope-3',
    ].sort());
    await helper.events.waitFor('e1');
  });

  test('deleteRole', async () => {
    await helper.events.listenFor('e1', helper.authEvents.roleDeleted());

    await helper.auth.deleteRole('thing-id:' + clientId);
    await helper.auth.deleteRole('thing-id:' + clientId);
    let roleId = 'thing-id:' + clientId.slice(0, 11) + '*';
    await helper.auth.deleteRole(roleId);

    await helper.auth.role('thing-id:' + clientId).then(() => {
      assert(false, 'Expected error');
    }, err => assert(err.statusCode === 404, 'Expected 404'));

    // At least one of them should trigger this message
    await helper.events.waitFor('e1');
  });

  test('update a role introducing a parameter cycle', async () => {
    await helper.auth.createRole('test*', {
      description: 'test*',
      scopes: ['assume:test2'],
    });
    helper.auth.updateRole('test*', {
      description: 'test*',
      scopes: ['assume:test2<..>'],
    }).then(() => assert(false, 'Expected an error'),
      err => assert.equal(err.statusCode, 400));
  });

  suite('updateRole', function() {
    let roleId = `thing-id:${clientId}`;
    let roleId2 = `sub-thing:${clientId}`;
    let auth;

    setup(async function() {
      auth = new helper.Auth({
        credentials: {clientId: 'root', accessToken: helper.rootAccessToken},
        authorizedScopes: [
          'auth:update-role:*',
          'scope:role-has:a',
          'scope:caller-has:a',
          'scope:caller-has:b*',
        ],
      });
      await helper.Role.remove({roleId}, true);
      await helper.Role.create({
        roleId,
        description: 'a role',
        scopes: ['scope:role-has:*', `assume:${roleId2}`],
        details: {
          created: new Date().toJSON(),
          lastModified: new Date().toJSON(),
        },
      });
      await helper.resolver.reloadRole(roleId);

      await helper.Role.remove({roleId: `${roleId2}`}, true);
      await helper.Role.create({
        roleId: roleId2,
        description: 'another role',
        scopes: ['scope:sub-role-has:*'],
        details: {
          created: new Date().toJSON(),
          lastModified: new Date().toJSON(),
        },
      });
      await helper.resolver.reloadRole(roleId2);
    });

    teardown(async function() {
      await helper.Role.remove({roleId}, true);
    });

    test('caller has new scope verbatim', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:role-has:*', 'scope:caller-has:a'],
      });
    });

    test('caller has a prefix of the new scope', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:caller-has:bxx'],
      });
    });

    test('role already has new scope verbatim', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:role-has:*'],
      });
    });

    test('role already has new scope by role expansion', async () => {
      // NOTE: this represents no immediate change, but if roleId2 later
      // had this scope removed, it wouldn't disappear from roleId..
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:sub-role-has:xyz', `assume:${roleId2}`],
      });
    });

    test('role already has a prefix of the new scope', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:role-has:x', 'scope:role-has:y'],
      });
    });

    test('caller does not have new scope', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: ['nobody-has-this'],
      }).then(() => assert(false, 'Expected an error'),
        err => assert(err.statusCode === 403));
    });

    test('remove a scope the caller does not posess', async () => {
      await auth.updateRole(roleId, {
        description: 'test role',
        scopes: [],
      });
    });
  });
});
