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
const subscribeTasks = require('../fixtures/tasksSubscriptions.graphql');
const { WebSocketLink } = require('apollo-link-ws');
const WebSocket = require('ws');
const { SubscriptionClient } = require('subscriptions-transport-ws');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withPulse(helper, skipping);

  suite('Task Queries and Mutations', function() {
    const getClient = () => {
      const cache = new InMemoryCache();
      const link = new HttpLink({
        uri: `http://localhost:${helper.serverPort}/graphql`,
        fetch,
      });
      return new ApolloClient({ cache, link });
    };

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

  suite('Task Subscriptions', function() {
    helper.withMockedEventIterator();

    const createSubscriptionClient = async () => {
      return new Promise(function(resolve, reject) {
        const subscriptionClient = new SubscriptionClient(
          `ws://localhost:${helper.serverPort}/subscription`,
          {
            reconnect: true,
          },
          WebSocket,
        );
        subscriptionClient.onConnected(function() {
          resolve(subscriptionClient);
        });
        subscriptionClient.onError(function(err) {
          reject(err);
        });
      });
    };

    const getClient = (subscriptionClient) => {
      const cache = new InMemoryCache();
      const link = new WebSocketLink(subscriptionClient);

      return new ApolloClient({ cache, link });
    };

    test('subscribe works', async function(){
      // We need to create this subscription client separately so we can close it after our test
      // Otherwise, our tests will just hang and timeout
      let subscriptionClient = await createSubscriptionClient();
      const client = getClient(subscriptionClient);

      let taskId = "subscribe-task-id";
      let taskGroupId = "subscribe-task-group-id";

      const payload = {
        tasksSubscriptions: {
          status: {
            taskId,
            taskGroupId,
          },
        },
      };

      const asyncIterator = new Object();
      asyncIterator[Symbol.asyncIterator] = async function*() {
        yield payload;
      };

      helper.setNextAsyncIterator(asyncIterator);

      let tasksSubscriptionsResult;
      let taskSubscription = client.subscribe({
        query: gql`${subscribeTasks}`,
        variables: {
          taskGroupId,
          subscriptions: ['tasksDefined'],
        },
      }).subscribe(
        (value) => tasksSubscriptionsResult = value,
      );

      await testing.poll(
        () => assert(tasksSubscriptionsResult),
        100, 10);

      assert(tasksSubscriptionsResult.data.tasksSubscriptions.taskId, taskId);
      assert(tasksSubscriptionsResult.data.tasksSubscriptions.taskGroupId, taskGroupId);

      taskSubscription.unsubscribe();
      subscriptionClient.close();
    });
  });
});
