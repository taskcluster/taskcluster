const assert = require('assert');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const deleteWorkerPoolMutation = require('../fixtures/deleteWorkerPool.graphql');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('WorkerPools', function() {
    test('deleting a worker pool calls deleteWorkerPool', async function() {
      const workerPoolId = 'ww/pp';
      helper.fakes.makeWorkerPool(workerPoolId, {});

      const client = helper.getHttpClient();

      await client.mutate({
        mutation: gql`${deleteWorkerPoolMutation}`,
        variables: {
          workerPoolId,
        },
      });

      assert(!helper.fakes.hasWorkerPool(workerPoolId));
    });
  });
});
