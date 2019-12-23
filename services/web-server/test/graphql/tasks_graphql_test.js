const assert = require('assert');
const taskcluster = require('taskcluster-client');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { HttpLink } = require('apollo-link-http');
const fetch = require('node-fetch');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const taskQuery = require('../fixtures/task.graphql');
const createTaskQuery = require('../fixtures/createTask.graphql');

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

  suite('Tasks', function() {
    test('query works', async function() {
      const client = getClient();
      const taskId = taskcluster.slugid();

      // 1. create task
      await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: helper.makeTaskDefinition(),
        },
      });

      // 2. get task
      const response = await client.query({
        query: gql`${taskQuery}`,
        variables: {
          taskId,
        },
      });

      assert.equal(response.data.task.taskId, taskId);
    });

    test('mutation works', async function() {
      const client = getClient();
      const taskId = taskcluster.slugid();
      const response = await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: helper.makeTaskDefinition(),
        },
      });

      assert.equal(response.data.createTask.taskId, taskId);
    });
  });
});
