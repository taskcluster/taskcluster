const assert = require('assert');
const debug = require('debug')('test:roles');
const helper = require('./helper');
const slugid = require('slugid');
const _ = require('lodash');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping, {orderedTests: true});
  helper.withRoles(mock, skipping, {orderedTests: true});
  helper.withServers(mock, skipping);

  let sorted = (arr) => {
    arr.sort();
    return arr;
  };

  // Setup a clientId we can play with
  let clientId, accessToken;
  clientId = slugid.v4();
  suiteSetup(async function() {
    if (skipping()) {
      this.skip();
    }
    let client = await helper.apiClient.createClient(clientId, {
      expires: taskcluster.fromNowJSON('1 day'),
      description: 'test client...',
      scopes: ['assume:thing-id:' + clientId],
    });
    accessToken = client.accessToken;
  });

  test('createRole (normal)', async () => {
    let role = await helper.apiClient.createRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    assume(role.description).equals('test role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(sorted(role.scopes)).deep.equals(sorted([
      'dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2',
    ]));
    assume(role.expandedScopes).contains('dummy-scope-1');
    assume(role.expandedScopes).contains('auth:create-role:*');

    // Check that it's idempotent
    let role2 = await helper.apiClient.createRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    assume(role2).deep.equals(role);

    helper.checkNextMessage('role-created', m => assert.equal(m.payload.roleId, `thing-id:${clientId}`));

    let client = await helper.apiClient.client(clientId);
    assume(client.expandedScopes.sort()).deep.equals(
      role.expandedScopes.sort()
    );
  });

  test('createRole (prefix)', async () => {
    let auth = new helper.AuthClient({
      rootUrl: helper.rootUrl,
      credentials: {clientId, accessToken},
    });

    let roleId = 'thing-id:' + clientId.slice(0, 11) + '*';
    let role = await auth.createRole(roleId, {
      description: 'test prefix role',
      scopes: ['dummy-scope-2'],
    });

    helper.checkNextMessage('role-created', m => assert.equal(m.payload.roleId, roleId));

    assume(role.description).equals('test prefix role');
    assume(new Date(role.created).getTime()).is.atmost(Date.now());
    assume(role.scopes).deep.equals(['dummy-scope-2']);
    assume(role.expandedScopes).contains('dummy-scope-2');
    // expandedScopes should always include itself
    assume(role.expandedScopes).contains('assume:' + roleId);

    let client = await helper.apiClient.client(clientId);
    assume(client.expandedScopes).contains('dummy-scope-1');
    assume(client.expandedScopes).contains('auth:create-role:*');
    assume(client.expandedScopes).contains('dummy-scope-2');
  });

  test('createRole (encodeURIComponent)', async () => {
    // Ensure that encodeURIComponent in client library works...
    let roleId = clientId + '/test ?test=1';
    let role = await helper.apiClient.createRole(roleId, {
      description: 'test role for werid roleId',
      scopes: ['dummy-scope-2'],
    });
    assume(role.roleId).equals(roleId);
    await helper.apiClient.deleteRole(roleId);
  });

  test('createRole introducing a cycle', async () => {
    let role = await helper.apiClient.createRole('test*', {
      description: 'test*',
      scopes: ['assume:other<..>x'],
    });
    assume(role.roleId).equals('test*');

    await helper.apiClient.createRole('other*', {
      description: 'other*',
      scopes: ['assume:te<..>'],
    }).then(() => assert(false, 'Expected error'),
      err => assert(err.statusCode === 400, 'Expected 400'));

    await helper.apiClient.deleteRole('test*');
  });

  test('getRole', async () => {
    let role = await helper.apiClient.role('thing-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:thing-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2',
    ].sort());
  });

  test('listRoles', async () => {
    let roles = await helper.apiClient.listRoles();
    assert(roles.some(role => role.roleId === 'thing-id:' + clientId));
  });

  test('updateRole (add scope)', async () => {
    let r1 = await helper.apiClient.role('thing-id:' + clientId);

    await testing.sleep(100);

    let r2 = await helper.apiClient.updateRole('thing-id:' + clientId, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3'],
    });
    assume(new Date(r2.lastModified).getTime()).greaterThan(
      new Date(r1.lastModified).getTime()
    );
    helper.checkNextMessage('role-updated', m => assert.equal(m.payload.roleId, `thing-id:${clientId}`));

    let role = await helper.apiClient.role('thing-id:' + clientId);
    assume(role.expandedScopes.sort()).deep.equals([
      'assume:thing-id:' + clientId,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2', // from role thing-id:<clientId[:11]>*
      'dummy-scope-3',
    ].sort());
  });

  test('deleteRole', async () => {
    await helper.apiClient.deleteRole('thing-id:' + clientId);
    await helper.apiClient.deleteRole('thing-id:' + clientId);
    let roleId = 'thing-id:' + clientId.slice(0, 11) + '*';
    await helper.apiClient.deleteRole(roleId);

    await helper.apiClient.role('thing-id:' + clientId).then(() => {
      assert(false, 'Expected error');
    }, err => assert(err.statusCode === 404, 'Expected 404'));

    // At least one of them should trigger this message
    helper.checkNextMessage('role-deleted', m => assert.equal(m.payload.roleId, `thing-id:${clientId}`));
  });

  test('create a role introducing a parameter cycle', async () => {
    await helper.apiClient.createRole('a*', {
      description: 'a*',
      scopes: ['assume:b<..>'],
    });
    await helper.apiClient.createRole('b*', {
      description: 'b*',
      scopes: ['assume:a<..>x'],
    }).then(() => assert(false, 'Expected an error'),
      err => assert.equal(err.statusCode, 400));
  });

  test('update a role introducing a parameter cycle', async () => {
    await Promise.all([
      await helper.apiClient.deleteRole('test-1:*'),
      await helper.apiClient.deleteRole('test-2:*'),
    ]);

    await helper.apiClient.createRole('test-1:*', {
      description: 'test role 1',
      scopes: ['assume:test-2:prefix-<..>/some-suffix'],
    });

    await helper.apiClient.createRole('test-2:*', {
      description: 'test role 2',
      scopes: ['plain-scope'],
    });

    await helper.apiClient.updateRole('test-2:*', {
      description: 'test role 2 (updated)',
      scopes: ['assume:test-1:prefix/<..>#some-suffix'],
    }).then(
      () => assert(false, 'Expected an error'),
      err => assert.equal(err.statusCode, 400),
    );
  });

  suite('updateRole', function() {
    let roleId = `thing-id:${clientId}`;
    let roleId2 = `sub-thing:${clientId}`;
    let auth;

    suiteSetup(async function() {
      if (skipping()) {
        this.skip();
      }
    });

    setup(async function() {
      auth = new helper.AuthClient({
        rootUrl: helper.rootUrl,
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: helper.rootAccessToken,
        },
        authorizedScopes: [
          'auth:update-role:*',
          'scope:role-has:a',
          'scope:caller-has:a',
          'scope:caller-has:b*',
        ],
      });
      // clear stuff out
      await helper.Roles.modify((roles) => roles.splice(0));

      await helper.apiClient.createRole(roleId, {
        description: 'a role',
        scopes: ['scope:role-has:*', `assume:${roleId2}`],
      });

      await helper.apiClient.createRole(roleId2, {
        description: 'another role',
        scopes: ['scope:sub-role-has:*'],
      });
    });

    teardown(async function() {
      await helper.Roles.modify((roles) => roles.splice(0));
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
