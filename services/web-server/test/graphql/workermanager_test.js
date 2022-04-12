const assert = require('assert');
const gql = require('graphql-tag');
const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const deleteWorkerPoolMutation = require('../fixtures/deleteWorkerPool.graphql');
const workerPoolQuery = require('../fixtures/workerPool.graphql');
const workerPoolsQuery = require('../fixtures/workerPools.graphql');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
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
    helper.fakes.makeWorkerPool('baz/bing', { owner: 'foo@example.com', currentCapacity: 4, requestedCount: 0, runningCount: 1, stoppingCount: 0, stoppedCount: 0, requestedCapacity: 0, runningCapacity: 1, stoppingCapacity: 0, stoppedCapacity: 0 });
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
    assert.equal(single.data.WorkerPool.requestedCount, 0);
    assert.equal(single.data.WorkerPool.runningCount, 1);
    assert.equal(single.data.WorkerPool.stoppingCount, 0);
    assert.equal(single.data.WorkerPool.stoppedCount, 0);
    assert.equal(single.data.WorkerPool.requestedCapacity, 0);
    assert.equal(single.data.WorkerPool.runningCapacity, 1);
    assert.equal(single.data.WorkerPool.stoppingCapacity, 0);
    assert.equal(single.data.WorkerPool.stoppedCapacity, 0);
  });

  test('list workerpools', async function() {
    helper.fakes.makeWorkerPool('foo/bar', { providerId: 'baz', currentCapacity: 0, requestedCount: 0, runningCount: 0, stoppingCount: 0, stoppedCount: 0, requestedCapacity: 0, runningCapacity: 0, stoppingCapacity: 0, stoppedCapacity: 0 });
    helper.fakes.makeWorkerPool('baz/bing', { providerId: 'wow', currentCapacity: 2, requestedCount: 1, runningCount: 0, stoppingCount: 1, stoppedCount: 0, requestedCapacity: 1, runningCapacity: 0, stoppingCapacity: 1, stoppedCapacity: 0 });
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
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.requestedCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.runningCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.stoppingCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.stoppedCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.requestedCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.runningCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.stoppingCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[0].node.stoppedCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.currentCapacity, 2);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.requestedCount, 1);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.runningCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.stoppingCount, 1);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.stoppedCount, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.requestedCapacity, 1);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.runningCapacity, 0);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.stoppingCapacity, 1);
    assert.equal(response.data.WorkerManagerWorkerPoolSummaries.edges[1].node.stoppedCapacity, 0);

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
