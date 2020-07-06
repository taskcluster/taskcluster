const _ = require('lodash');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['gcp', 'azure'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withGcp(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServers(mock, skipping);

  test('gcpCredentials invalid account', async () => {
    try {
      await helper.apiClient.gcpCredentials(helper.gcpAccount.project_id, 'invalid@mozilla.com');
    } catch (e) {
      if (e.statusCode !== 404) {
        throw e;
      }
      return;
    }
    assert.fail('The call should fail');
  });

  test('gcpCredentials black listed account', async () => {
    try {
      await helper.apiClient.gcpCredentials(helper.gcpAccount.project_id, 'noallowed@mozilla.com');
    } catch (e) {
      if (e.statusCode !== 400) {
        throw e;
      }
      return;
    }
    assert.fail('The call should fail');
  });

  test('gcpCredentials invalid projectId', async () => {
    try {
      await helper.apiClient.gcpCredentials('invalidprojectid', helper.gcpAccount.email);
    } catch (e) {
      if (e.statusCode !== 404) {
        throw e;
      }
      return;
    }
    assert.fail('The call should fail');
  });

  test('gcpCredentials successful', async () => {
    const res = await helper.apiClient.gcpCredentials(helper.gcpAccount.project_id, helper.gcpAccount.email);

    if (mock) {
      assert.equal(res.accessToken, 'sekrit');
    }
  });
});
