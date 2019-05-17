const _ = require('lodash');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['app', 'gcp', 'azure'], function(mock, skipping) {
  helper.withGcp(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);
  helper.withCfg(mock, skipping);

  test('gcpCredentials invalid account', async () => {
    try {
      await helper.apiClient.gcpCredentials('-', 'invalidserviceaccount@mozilla.com');
    } catch (e) {
      if (e.statusCode !== 404) {
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
      if (e.statusCode !== 400) {
        throw e;
      }
      return;
    }
    assert.fail('The call should fail');
  });

  test('gcpCredentials successful', async () => {
    const res = await helper.apiClient.gcpCredentials('-', helper.gcpAccount.email);

    if (mock) {
      assert.equal(res.accessToken, 'sekrit');
    }
  });

  test('gcpCredentials after setting policy', async () => {
    await helper.apiClient.gcpCredentials('-', helper.gcpAccount.email);

    // verify that the service account is still configured correctly and not
    // endlessly adding bindings or members
    const {googleapis, auth} = await helper.load('gcp');
    const iam = googleapis.iam({version: 'v1', auth});
    const res = await iam.projects.serviceAccounts.getIamPolicy({
      resource_: `projects/-/serviceAccounts/${helper.gcpAccount.email}`,
    });

    // GCP obscures the member serviceAccount, so we just assert that
    // there are the correct number of bindings and members
    assert.deepEqual(res.data.bindings.map(({role}) => role),
      ['roles/iam.serviceAccountTokenCreator']);
    assert.equal(res.data.bindings[0].members.length, 1);
  });
});
