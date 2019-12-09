const assert = require('assert');
const taskcluster = require('taskcluster-client');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { HttpLink } = require('apollo-link-http');
const fetch = require('node-fetch');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const merge = require('deepmerge');
const helper = require('./helper');
const taskQuery = require('./fixtures/task.graphql');
const createTaskQuery = require('./fixtures/createTask.graphql');
const loader = require('../src/loaders/tasks');

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

  const makeTaskDefinition = (options = {}) => merge({
    provisionerId: "no-provisioner-extended-extended",
    workerType: "test-worker-extended-extended",
    schedulerId: "my-scheduler-extended-extended",
    taskGroupId: "dSlITZ4yQgmvxxAi4A8fHQ",
    dependencies: [],
    requires: 'ALL_COMPLETED',
    routes: [],
    priority: 'LOWEST',
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    expires: taskcluster.fromNowJSON('3 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: "Testing task",
      description: "Task created during tests",
      owner: "haali@mozilla.com",
      source: "https://github.com/taskcluster/taskcluster",
    },
    tags: {
      purpose: "taskcluster-testing",
    },
    extra: {},
  }, options);

  suite('Queue', function() {
    test('query works', async function() {
      const client = getClient();
      const taskId = taskcluster.slugid();

      // 1. create task
      await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: makeTaskDefinition(),
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
    // Make sure we still get tasks even if we end up loading some tasks that don't exist
    test('load multiple tasks while gracefully handling errors', async function() {
      const client = getClient();
      const taskId = taskcluster.slugid();

      // 1. create task
      await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: makeTaskDefinition(),
        },
      });

      const taskLoader = loader({ queue: helper.clients().queue, index: helper.clients.index }).task;

      // 2. get tasks
      const [firstTask, taskThatDoesNotExist] = await Promise.allSettled([
        taskLoader.load(taskId),
        taskLoader.load('taskId-that-does-not-exist'),
      ]);

      assert.equal(firstTask.status, 'fulfilled');
      assert.equal(firstTask.value.taskId, taskId);
      assert.equal(taskThatDoesNotExist.status, 'rejected');
      assert(taskThatDoesNotExist.reason instanceof Error);
    });

    test('mutation works', async function() {
      const client = getClient();
      const taskId = taskcluster.slugid();
      const response = await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: makeTaskDefinition(),
        },
      });

      assert.equal(response.data.createTask.taskId, taskId);
    });
  });
});
