import assert from 'assert';
import taskcluster from '@taskcluster/client';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('Roles GraphQL', function() {
    test('role query works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };

      const createRoleMutation = await helper.loadFixture('createRole.graphql');
      const roleQuery = await helper.loadFixture('role.graphql');

      // 1. create role
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      // 2. get role
      const response = await client.query({
        query: gql`${roleQuery}`,
        variables: {
          roleId,
        },
      });

      assert.equal(response.data.role.roleId, roleId);
    });

    test('roles query works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };

      const createRoleMutation = await helper.loadFixture('createRole.graphql');
      const rolesQuery = await helper.loadFixture('roles.graphql');

      // 1. create roles
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId: roleId,
          role: role,
        },
      });

      // 2. get roles
      const response = await client.query({
        query: gql`${rolesQuery}`,
      });

      assert.equal(response.data.roles.length, 1);
      assert.equal(response.data.roles[0].roleId, roleId);
    });

    test('list role ids query works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope 1",
      };
      const createRoleMutation = await helper.loadFixture('createRole.graphql');
      const listRoleIdsQuery = await helper.loadFixture('listRoleIds.graphql');

      // 1. create roles
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      // 2. get role Ids
      const response = await client.query({
        query: gql`${listRoleIdsQuery}`,
      });

      assert.equal(response.data.listRoleIds.edges.length, 1);
      assert.equal(response.data.listRoleIds.edges[0].node.roleId, roleId);
    });

    test('create role mutation works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };
      const createRoleMutation = await helper.loadFixture('createRole.graphql');

      // 1. create role
      const response = await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      assert.equal(response.data.createRole.roleId, roleId);
    });

    test('update role mutation works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };
      const createRoleMutation = await helper.loadFixture('createRole.graphql');
      const roleQuery = await helper.loadFixture('role.graphql');
      const updateRoleMutation = await helper.loadFixture('updateRole.graphql');

      // 1. create role
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      // 2. update role
      role.scopes = ["scope2"];

      await client.mutate({
        mutation: gql`${updateRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      // 3. get role
      const response = await client.query({
        query: gql`${roleQuery}`,
        variables: {
          roleId,
        },
      });

      assert.equal(response.data.role.roleId, roleId);
      assert.equal(response.data.role.scopes[0], role.scopes[0]);
    });

    test('delete role mutation works', async function() {
      const client = helper.getHttpClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };
      const createRoleMutation = await helper.loadFixture('createRole.graphql');
      const deleteRoleMutation = await helper.loadFixture('deleteRole.graphql');

      // 1. create role
      await client.mutate({
        mutation: gql`${createRoleMutation}`,
        variables: {
          roleId,
          role,
        },
      });

      // 2. delete role
      const response = await client.mutate({
        mutation: gql`${deleteRoleMutation}`,
        variables: {
          roleId: roleId,
        },
      });

      assert.equal(response.data.deleteRole, roleId);
    });
  });
});
