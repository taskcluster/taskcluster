const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

const SERVICE_ACCOUNT = "taskcluster-auth-test@linux64-builds.iam.gserviceaccount.com";

helper.secrets.mockSuite(testing.suiteName(), ['app', 'gcp'], function(mock, skipping) {
  if (mock || skipping()) {
    return;
  }

  helper.withPulse('mock', skipping);
  helper.withEntities('mock', skipping);
  helper.withRoles('mock', skipping);
  helper.withServers(mock, skipping);
  helper.withCfg(mock, skipping);

  test('gcpCredentials invalid account', async () => {
    try {
      await helper.apiClient.gcpCredentials('-', 'invalidserviceaccount@mozilla.com');
      assert.fail('The call should fail');
    } catch (e) {
      assert.equal(e.statusCode, 404);
    }
  });

  test('gcpCredentials invalid projectId', async () => {
    try {
      await helper.apiClient.gcpCredentials('invalidprojectid', SERVICE_ACCOUNT);
      assert.fail('The call should fail');
    } catch (e) {
      assert.equal(e.statusCode, 400);
    }
  });

  test('gcpCredentials successful', async () => {
    await helper.apiClient.gcpCredentials('-', SERVICE_ACCOUNT);
  });

  test('gcpCredentials after setting policy', async () => {
    await helper.apiClient.gcpCredentials('-', SERVICE_ACCOUNT);
  });
});
