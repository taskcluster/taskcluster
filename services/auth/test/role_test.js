const assert = require('assert');
const helper = require('./helper');
const slugid = require('slugid');
const _ = require('lodash');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), ['db', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping, {orderedTests: true});
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

    helper.assertPulseMessage('role-created', m => m.payload.roleId === `thing-id:${clientId}`);

    let client = await helper.apiClient.client(clientId);
    assume(client.expandedScopes.sort()).deep.equals(
      role.expandedScopes.sort(),
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

    helper.assertPulseMessage('role-created', m => m.payload.roleId === roleId);

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

  test('createRole with a **-scope', async () => {
    await helper.apiClient.createRole('other', {
      description: 'other',
      scopes: ['foo:***'],
    }).then(() => assert(false, 'Expected error'),
      err => assert(err.statusCode === 400, 'Expected 400'));
  });

  test('createRole twice with identical roles', async function() {
    await helper.apiClient.createRole('double', {
      description: 'double-add',
      scopes: ['foo'],
    });
    await helper.apiClient.createRole('double', {
      description: 'double-add',
      scopes: ['foo'],
    });

    const matchingRoles = (await helper.apiClient.listRoles())
      .filter(r => r.roleId === 'double');
    assert.equal(matchingRoles.length, 1);

    await helper.apiClient.deleteRole('double');
  });

  test('createRole but pulse publish fails', async function() {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(() => apiClient.createRole('no-publish', {
      description: 'no-pulse-message',
      scopes: ['foo'],
    }),
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
    await apiClient.createRole('no-publish', {
      description: 'no-pulse-message',
      scopes: ['foo'],
    });
  });

  test('createRole twice with different roles', async function() {
    await helper.apiClient.createRole('double', {
      description: 'double-add',
      scopes: ['foo'],
    });
    try {
      await helper.apiClient.createRole('double', {
        description: 'double-add',
        scopes: ['DIFFERENT'],
      });
      throw new Error('expected exception');
    } catch (err) {
      if (err.statusCode !== 409) {
        throw err;
      }
    }

    const matchingRoles = (await helper.apiClient.listRoles())
      .filter(r => r.roleId === 'double');
    assert.equal(matchingRoles.length, 1);

    await helper.apiClient.deleteRole('double');
  });

  test('createRole twice at the same time, with identical roles', async function() {
    await Promise.all([
      helper.apiClient.createRole('double', {
        description: 'double-add',
        scopes: ['foo'],
      }),
      helper.apiClient.createRole('double', {
        description: 'double-add',
        scopes: ['foo'],
      }),
    ]);

    const matchingRoles = (await helper.apiClient.listRoles())
      .filter(r => r.roleId === 'double');
    assert.equal(matchingRoles.length, 1);

    await helper.apiClient.deleteRole('double');
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
    assert(roles.some(role => role.roleId === `thing-id:${clientId}`));
  });

  test('listRoleIds', async () => {
    // Clear existing roles
    await helper.Roles.modifyRole(({ blob: roles }) => roles.splice(0));

    // Create 4 dummy roles
    await helper.apiClient.createRole(`thing-id:${clientId}`, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    for (let i = 0;i < 3;i++) {
      let tempRoleId = `${clientId}${i}`;
      await helper.apiClient.createRole(tempRoleId, {
        description: 'test role',
        scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
      });
    }

    let result = await helper.apiClient.listRoleIds();

    assert(result.roleIds.some(roleId => roleId === `thing-id:${clientId}`));
    assert(result.roleIds.length === 4);
  });

  test('listRoleIds (limit, [continuationToken])', async () => {
    let roleIds = [];
    let allRoleIds = {};
    let count = 0;
    let query = {limit: 1};

    allRoleIds = await helper.apiClient.listRoleIds();

    while (true) {
      let result = await helper.apiClient.listRoleIds(query);
      assume(result.roleIds.length).to.be.lessThan(2);
      query.continuationToken = result.continuationToken;
      roleIds = roleIds.concat(result.roleIds);
      count++;
      if (!query.continuationToken) {
        break;
      }
    }

    assume(roleIds.sort()).to.deeply.equal(allRoleIds.roleIds.sort());
    assume(count).to.be.greaterThan(1);

    // Testing for erroneous continuationToken
    query.limit = 1;
    query.continuationToken = 'FOOBAR';

    await helper.apiClient.listRoleIds(query)
      .then(() => assert(false, 'Expected error'),
        err => assert(err.statusCode === 400, 'Expected 400'));
  });

  test('listRoles2', async () => {
    // Clear existing roles
    await helper.Roles.modifyRole(({ blob: roles }) => roles.splice(0));

    // Create 4 dummy roles
    await helper.apiClient.createRole(`thing-id:${clientId}`, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    for (let i = 0;i < 3;i++) {
      let tempRoleId = `${clientId}${i}`;
      await helper.apiClient.createRole(tempRoleId, {
        description: 'test role',
        scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
      });
    }

    let result = await helper.apiClient.listRoles2();

    assert(result.roles.some(role => role.roleId === `thing-id:${clientId}`));
    assert(result.roles.some(role => role.description === 'test role'));
    assert(result.roles.some(role => _.isEqual(role.scopes.sort(), ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'].sort())));
    assert(result.roles.length === 4);
  });

  test('listRoles2 (limit, [continuationToken])', async () => {
    let roles = [];
    let allRoles = {};
    let count = 0;
    let query = {limit: 1};

    allRoles = await helper.apiClient.listRoles2();

    while (true) {
      let result = await helper.apiClient.listRoles2(query);
      assume(result.roles.length).to.be.lessThan(2);
      query.continuationToken = result.continuationToken;
      roles = roles.concat(result.roles);
      count++;
      if (!query.continuationToken) {
        break;
      }
    }

    assume(roles.sort()).to.deeply.equal(allRoles.roles.sort());
    assume(count).to.be.greaterThan(1);

    // Testing for erroneous continuationToken
    query.limit = 1;
    query.continuationToken = 'FOOBAR';

    await helper.apiClient.listRoles2(query)
      .then(() => assert(false, 'Expected error'),
        err => assert(err.statusCode === 400, 'Expected 400'));
  });

  test('updateRole with a **-scope', async () => {
    await helper.apiClient.updateRole('thing-id:' + clientId, {
      description: 'other',
      scopes: ['foo:***'],
    }).then(() => assert(false, 'Expected error'),
      err => assert(err.statusCode === 400, 'Expected 400'));
  });

  test('updateRole (add scope)', async () => {
    // Clearing existing roles
    await helper.Roles.modifyRole(({ blob: roles }) => roles.splice(0));

    // Generating dummy roles for the test
    await helper.apiClient.createRole(`thing-id:${clientId}`, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-2'],
    });
    await helper.apiClient.createRole(`thing-id:${clientId.slice(0, 11)}*`, {
      description: 'test role',
      scopes: ['dummy-scope-2'],
    });

    let r1 = await helper.apiClient.role(`thing-id:${clientId}`);

    await testing.sleep(100);

    let r2 = await helper.apiClient.updateRole(`thing-id:${clientId}`, {
      description: 'test role',
      scopes: ['dummy-scope-1', 'auth:create-role:*', 'dummy-scope-3'],
    });

    assume(new Date(r2.lastModified).getTime()).greaterThan(
      new Date(r1.lastModified).getTime(),
    );
    helper.assertPulseMessage('role-updated', m => m.payload.roleId === `thing-id:${clientId}`);

    let role = await helper.apiClient.role(`thing-id:${clientId}`);
    assume(role.expandedScopes.sort()).deep.equals([
      `assume:thing-id:${clientId}`,
      'dummy-scope-1',
      'auth:create-role:*',
      'dummy-scope-2', // from role thing-id:<clientId[:11]>*
      'dummy-scope-3',
    ].sort());
  });

  test('deleteRole where pulse publish fails', async () => {
    helper.onPulsePublish(() => {
      throw new Error('uhoh');
    });
    const apiClient = helper.apiClient.use({retries: 0});
    await assert.rejects(() => apiClient.deleteRole('thing-id:' + clientId));

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(
        ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
      ).length,
      1);
    monitor.manager.reset();
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
    helper.assertPulseMessage('role-deleted', m => m.payload.roleId === `thing-id:${clientId}`);
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
      await helper.Roles.modifyRole(({ blob: roles }) => roles.splice(0));

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
      await helper.Roles.modifyRole(({ blob: roles }) => roles.splice(0));
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

    test('updateRole where publish fails', async () => {
      helper.onPulsePublish(() => {
        throw new Error('uhoh');
      });
      const apiClient = auth.use({retries: 0});
      await assert.rejects(() => apiClient.updateRole(roleId, {
        description: 'test role',
        scopes: ['scope:role-has:*'],
      }));

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
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
