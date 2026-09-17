import assert from 'node:assert';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withClients(skipping);
  helper.withServer(skipping);
  helper.resetTables();

  test('get single workerpool', async () => {
    helper.fakes.makeWorkerPool('baz/bing', {
      owner: 'foo@example.com',
      currentCapacity: 4,
      requestedCount: 0,
      runningCount: 1,
      stoppingCount: 0,
      stoppedCount: 0,
      requestedCapacity: 0,
      runningCapacity: 1,
      stoppingCapacity: 0,
      stoppedCapacity: 0,
    });
    const client = helper.getHttpClient();
    const workerPoolQuery = await helper.loadFixture('workerPool.graphql');
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
});
