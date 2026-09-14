import assert from 'node:assert';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withFakeAuthFactory(skipping);
  helper.withDb(mock, skipping);
  helper.withClients(skipping);
  helper.withServer(skipping);
  helper.resetTables();

  suite('Artifact Queries GraphQL', () => {
    test('artifacts query works', async () => {
      const client = helper.getHttpClient();
      const taskId = 'artifact-id';
      const runId = 123456;
      const getArtifacts = await helper.loadFixture('artifacts.graphql');

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

    test('latest artifacts query works', async () => {
      const client = helper.getHttpClient();
      const taskId = 'artifact-id';
      const getLatestArtifacts = await helper.loadFixture('latestArtifacts.graphql');

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
});
