const assert = require('assert');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const getArtifacts = require('../fixtures/artifacts.graphql');
const getLatestArtifacts = require('../fixtures/latestArtifacts.graphql');
const artifactsCreated = require('../fixtures/artifactsCreated.graphql');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('Artifact Queries GraphQL', function() {
    test('artifacts query works', async function() {
      const client = helper.getHttpClient();
      const taskId = "artifact-id";
      const runId = 123456;

      const response = await client.query({
        query: gql`${getArtifacts}`,
        variables: {
          taskId: taskId,
          runId: runId,
        },
      });

      assert.equal(response.data.artifacts.edges.length, 3);
      assert.equal(response.data.artifacts.edges[0].node.taskId, taskId);
      assert.equal(response.data.artifacts.edges[0].node.name.includes('artifact-'), true);
    });

    test('latest artifacts query works', async function() {
      const client = helper.getHttpClient();
      const taskId = "artifact-id";

      const response = await client.query({
        query: gql`${getLatestArtifacts}`,
        variables: {
          taskId: taskId,
        },
      });

      assert.equal(response.data.latestArtifacts.edges.length, 3);
      assert.equal(response.data.latestArtifacts.edges[0].node.taskId, taskId);
      assert.equal(response.data.latestArtifacts.edges[0].node.name.includes('artifact-'), true);
    });
  });

  suite('Artifact Subscriptions', function() {
    helper.withMockedEventIterator();

    test('subscribe works', async function(){
      let subscriptionClient = await helper.createSubscriptionClient();
      const client = helper.getWebsocketClient(subscriptionClient);

      const payload = {
        artifactsCreated: {
          artifact: {
            name: "name",
          },
        },
      };

      const asyncIterator = new Object();
      asyncIterator[Symbol.asyncIterator] = async function*() {
        yield payload;
      };

      helper.setNextAsyncIterator(asyncIterator);

      let subscriptionResult;
      let subscription = client.subscribe({
        query: gql`${artifactsCreated}`,
        variables: {
          taskGroupId: "groupId",
        },
      }).subscribe(
        (value) => subscriptionResult = value,
        (error) => console.log(error),
      );

      await testing.poll(
        () => assert(subscriptionResult),
        100, 10);

      assert.equal(subscriptionResult.data.artifactsCreated.artifact.name, "name");

      subscription.unsubscribe();
      subscriptionClient.close();
    });
  });

});
