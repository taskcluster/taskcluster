const assert = require('assert');
const taskcluster = require('taskcluster-client');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { HttpLink } = require('apollo-link-http');
const fetch = require('node-fetch');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const createRoleMutation = require('../fixtures/createRole.graphql');
const loader = require('../../src/loaders/roles');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);

  const getClient = () => {
    const cache = new InMemoryCache();
    const httpLink = new HttpLink({
      uri: `http://localhost:${helper.serverPort}/graphql`,
      fetch,
    });

    return new ApolloClient({ cache, link: httpLink });
  };

  suite('roles loaders', function() {
    test('load role while gracefully handling errors', async function() {
      const client = getClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };

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
      const client = getClient();
      const roleId = taskcluster.slugid();
      const role = {
        scopes: ["scope1"],
        description: "Test Scope",
      };

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
