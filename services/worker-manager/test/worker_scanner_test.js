const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withWorkerScanner(mock, skipping);

  test('starts and stops', async function() {
    await helper.initiateWorkerScanner();
    await helper.terminateWorkerScanner();
  });
});
