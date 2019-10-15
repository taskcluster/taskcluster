const helper = require('./helper');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', () => {
    return helper.apiClient.ping();
  });

  test('Publish purge-cache requests', async () => {
    // We should have no purge-cache requests to start with
    let openRequests = await helper.apiClient.allPurgeRequests();
    assume(openRequests.requests).is.empty();

    // Request a purge-cache message
    await helper.apiClient.purgeCache('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended', {
      cacheName: 'my-test-cache',
    });

    // Check that the first request is valid
    openRequests = await helper.apiClient.allPurgeRequests();
    assume(openRequests.requests.length).equals(1);
    let request = openRequests.requests[0];
    assume(request.cacheName).equals('my-test-cache');
    assume(request.provisionerId).equals('dummy-provisioner-extended-extended');
    assume(request.workerType).equals('dummy-worker-extended-extended');
    let firstBefore = new Date(request.before);

    // Check if we can override and update an existing request
    await helper.apiClient.purgeCache('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended', {
      cacheName: 'my-test-cache',
    });
    openRequests = await helper.apiClient.allPurgeRequests();
    let newBefore = new Date(openRequests.requests[0].before);
    assume(newBefore.valueOf()).is.gt(firstBefore.valueOf());

    // Add a second request
    await helper.apiClient.purgeCache('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended', {
      cacheName: 'my-test-cache-2',
    });
    openRequests = await helper.apiClient.allPurgeRequests();
    assume(openRequests.requests.length).equals(2);

    // Try with different worker/provisioner
    await helper.apiClient.purgeCache('dummy-provisioner-extended-extended-2', 'dummy-worker-extended-extended', {
      cacheName: 'my-test-cache',
    });
    await helper.apiClient.purgeCache('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended-2', {
      cacheName: 'my-test-cache',
    });
    openRequests = await helper.apiClient.allPurgeRequests();
    assume(openRequests.requests.length).equals(4);

    let spec = await helper.apiClient.purgeRequests('dummy-provisioner-extended-extended-2', 'dummy-worker-extended-extended');
    assume(spec.requests.length).equals(1);
    spec = await helper.apiClient.purgeRequests('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended-2');
    assume(spec.requests.length).equals(1);
    spec = await helper.apiClient.purgeRequests('dummy-provisioner-extended-extended', 'dummy-worker-extended-extended');
    assume(spec.requests.length).equals(2);

    // Finally we try with since included
    spec = await helper.apiClient.purgeRequests(
      'dummy-provisioner-extended-extended',
      'dummy-worker-extended-extended',
      {since: spec.requests[0].before}
    );
    assume(spec.requests.length).equals(2);
    spec = await helper.apiClient.purgeRequests(
      'dummy-provisioner-extended-extended',
      'dummy-worker-extended-extended',
      {since: spec.requests[1].before}
    );
    assume(spec.requests.length).equals(1);
    spec = await helper.apiClient.purgeRequests(
      'dummy-provisioner-extended-extended',
      'dummy-worker-extended-extended',
      {since: new Date().toJSON()}
    );
    assume(spec.requests.length).equals(0);
  });
});
