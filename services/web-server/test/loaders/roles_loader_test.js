import assert from 'assert';
import taskcluster from 'taskcluster-client';
import gql from 'graphql-tag';
import testing from 'taskcluster-lib-testing';
import helper from '../helper.js';
import loader from '../../src/loaders/roles.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('roles loaders', function() {
    test('load role while gracefully handling errors', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };

      const createRoleMutation = await helper.loadFixture('createRole.graphql');

      // 1. create role
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      const roleLoader = loader({ auth: helper.clients().auth }).role;

      // 2. get roles
      const [firstRole, roleThatDoesNotExist] = await Promise.allSettled([
        roleLoader.load(roleId),
        roleLoader.load('roleId-that-does-not-exist'),
      ]);

      assert.equal(firstRole.status, 'fulfilled');
      assert.equal(firstRole.value.roleId, roleId);
      assert.equal(roleThatDoesNotExist.status, 'rejected');
      assert(roleThatDoesNotExist.reason instanceof Error);
    });

    test('load roles', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };
      const createRoleMutation = await helper.loadFixture('createRole.graphql');

      // 1. create role
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      const roleLoaders = loader({ auth: helper.clients().auth }).roles;

      // 2. get roles
      const [roles] = await Promise.allSettled([
        roleLoaders.load({}),
      ]);

      assert.equal(roles.status, 'fulfilled');
      assert.equal(roles.value[0].roleId, roleId);
    });
  });
});
