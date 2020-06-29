const assert = require('assert');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const deleteWorkerPoolMutation = require('../fixtures/deleteWorkerPool.graphql');
const workerPoolQuery = require('../fixtures/workerPool.graphql');
const workerPoolsQuery = require('../fixtures/workerPools.graphql');

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

  test('get single workerpool', async function() {
    helper.fakes.makeWorkerPool('baz/bing', {owner: 'foo@example.com', currentCapacity: 4});
    const client = helper.getHttpClient();
    const single = await client.query({
      query: gql`${workerPoolQuery}`,
      variables: {
        workerPoolId: 'baz/bing',
      },
    });

    assert.equal(single.data.WorkerPool.workerPoolId, 'baz/bing');
    assert.equal(single.data.WorkerPool.owner, 'foo@example.com');
    assert.equal(single.data.WorkerPool.currentCapacity, 4);
  });

  test('list workerpools', async function() {
    helper.fakes.makeWorkerPool('foo/bar', {providerId: 'baz', currentCapacity: 0});
    helper.fakes.makeWorkerPool('baz/bing', {providerId: 'wow', currentCapacity: 2});
    const client = helper.getHttpClient();
    const response = await client.query({
      query: gql`${workerPoolsQuery}`,
    });

    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges.length, 2);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.workerPoolId, 'foo/bar');
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.workerPoolId, 'baz/bing');
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.providerId, 'baz');
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.providerId, 'wow');

    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.currentCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.currentCapacity, 2);

    const clippedResponse = await client.query({
      query: gql`${workerPoolsQuery}`,
      variables: {
        connection: {
          limit: 1,
        },
      },
    });

    assert.equal(clippedResponse.data.WorkerManagerWorkerPoolSummaries.edges.length, 1);
    assert.equal(clippedResponse.data.WorkerManagerWorkerPoolSummaries.edges[0].node.workerPoolId, 'foo/bar');
    assert.equal(clippedResponse.data.WorkerManagerWorkerPoolSummaries.edges[0].node.providerId, 'baz');
  });
});
