const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);

  suite('expireWorkerPools', function() {
    const makeWP = async values => {
      const now = new Date();
      await helper.WorkerPool.create({
        workerPoolId: 'pp/wt',
        providerId: 'testing',
        description: 'none',
        previousProviderIds: [],
        created: now,
        lastModified: now,
        config: {},
        owner: 'whoever@example.com',
        providerData: {},
        emailOnError: false,
        ...values,
      });
    };

    const checkWP = async workerPoolId => {
      return await helper.WorkerPool.load({workerPoolId}, true);
    };

    setup(function() {
      helper.load.remove('expireWorkerPools');
    });

    test('scan of empty set of worker pools', async function() {
      await helper.load('expireWorkerPools');
    });

    test('worker pool with an active providerId', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'testing'});
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider but previousProviderIds', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: ['something']});
      await helper.load('expireWorkerPools');
      assert(await checkWP('pp/wt'));
    });

    test('worker pool with null-provider and empty previousProviderIds', async function() {
      await makeWP({workerPoolId: 'pp/wt', providerId: 'null-provider', previousProviderIds: []});
      await helper.load('expireWorkerPools');
      assert.equal(await checkWP('pp/wt'), undefined);
    });
  });
});
