import _ from 'lodash';
import assert from 'assert';
import * as helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['gcp', 'azure'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  const gcp = helper.withGcp(mock, skipping);
  helper.withPulse(mock, skipping);
  const servers = helper.withServers(mock, skipping);
  helper.resetTables(mock, skipping);

  test('gcpCredentials invalid account', async () => {
    try {
      await servers.apiClient.gcpCredentials(gcp.gcpAccount.project_id, 'invalid@mozilla.com');
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
      await servers.apiClient.gcpCredentials(gcp.gcpAccount.project_id, 'noallowed@mozilla.com');
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
      await servers.apiClient.gcpCredentials('invalidprojectid', gcp.gcpAccount.email);
    } catch (e) {
      if (e.statusCode !== 404) {
        throw e;
      }
      return;
    }
    assert.fail('The call should fail');
  });

  test('gcpCredentials successful', async () => {
    const res = await servers.apiClient.gcpCredentials(gcp.gcpAccount.project_id, gcp.gcpAccount.email);

    if (mock) {
      assert.equal(res.accessToken, 'sekrit');
    }
  });
});
