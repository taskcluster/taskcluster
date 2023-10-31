import assert from 'assert';
import gql from 'graphql-tag';
import testing from 'taskcluster-lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('Hooks GraphQL', function() {
    test('hooks query works', async function() {
      const client = helper.getHttpClient();
      const hookGroupId = 'hook-group';
      const hookId = 'hook';
      const payload = {
        metadata: {
          name: 'test hook',
          description: 'test hook',
          owner: 'owner@taskcluster.com',
        },
        task: helper.makeTaskDefinition(),
      };

      await client.mutate({
        mutation: gql`${await helper.loadFixture('createHook.graphql') }`,
        variables: {
          hookGroupId,
          hookId,
          payload,
        },
      });

      const response = await client.query({
        query: gql`${await helper.loadFixture('hook.graphql')}`,
        variables: {
          hookGroupId,
          hookId,
        },
      });

      assert.equal(response.data.hook.hookId, hookId);

      // check lastFire
      const lastFireResponse = await client.query({
        query: gql`${await helper.loadFixture('hookLastFires.graphql')}`,
        variables: {
          hookGroupId,
          hookId,
        },
      });
      assert.equal(lastFireResponse.data.hookLastFires.edges.length, 7);
    });
  });
});
