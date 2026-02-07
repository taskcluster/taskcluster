import assert from 'assert';
import taskcluster from '@taskcluster/client';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';
import WebSocket from 'ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  // Use mutable scopeOverride to allow tests to dynamically change auth scopes
  let scopeOverride = null;

  suiteSetup('withMutableAuthFactory', function() {
    if (skipping()) {
      return;
    }
    helper.load.inject('authFactory', ({ credentials }) =>
      new taskcluster.Auth({
        rootUrl: helper.rootUrl,
        fake: {
          currentScopes: async () => ({
            scopes: scopeOverride || ['web:read-pulse'],
          }),
        },
      }),
    );
  });

  suiteTeardown(function() {
    helper.load.remove('authFactory');
  });

  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withPulse(helper, skipping);
  helper.resetTables(mock, skipping);

  suite('Task Queries and Mutations', function() {
    test('query works', async function() {
      const client = helper.getHttpClient();
      const taskId = taskcluster.slugid();
      const createTaskQuery = await helper.loadFixture('createTask.graphql');
      const taskQuery = await helper.loadFixture('task.graphql');

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
      const client = helper.getHttpClient();
      const taskId = taskcluster.slugid();
      const createTaskQuery = await helper.loadFixture('createTask.graphql');

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

    test('subscribe works', async function() {
      let subscriptionClient = await helper.createSubscriptionClient();
      const client = helper.getWebsocketClient(subscriptionClient);

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

      const subscribeTasks = await helper.loadFixture('tasksSubscriptions.graphql');

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

    test('connection rejected without web:read-pulse scope', async function() {
      scopeOverride = [];
      let subscriptionClient;
      try {
        const error = await new Promise((resolve, reject) => {
          subscriptionClient = new SubscriptionClient(
            `ws://localhost:${helper.serverPort}/subscription`,
            {
              reconnect: false,
              connectionCallback: (err) => {
                if (err) {
                  resolve(err);
                } else {
                  reject(new Error('Expected connection to be rejected'));
                }
              },
              connectionParams: () => ({
                Authorization: `Bearer ${btoa(JSON.stringify({
                  clientId: 'testing',
                  accessToken: 'testing',
                }))}`,
              }),
            },
            WebSocket,
          );
        });

        const errStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
        assert(
          errStr.includes('InsufficientScopes'),
          `Expected InsufficientScopes error, got: ${errStr}`,
        );
      } finally {
        if (subscriptionClient) {
          subscriptionClient.close();
        }
        scopeOverride = null;
      }
    });
  });
});
