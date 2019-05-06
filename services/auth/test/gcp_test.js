const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const slugid = require('slugid');
const {google} = require('googleapis');

helper.secrets.mockSuite(testing.suiteName(), ['app', 'gcp'], function(mock, skipping) {
  if (mock) {
    return;
  }

  helper.withPulse('mock', skipping);
  helper.withEntities('mock', skipping);
  helper.withRoles('mock', skipping);
  helper.withServers(mock, skipping);
  helper.withCfg(mock, skipping);

  let auth, account, iam;
  const accountId = slugid.nice().replace(/_/g, '').toLowerCase();

  suiteSetup('GCP credentials', async () => {
    const credentials = helper.secrets.get('gcp').credentials;
    const projectId = credentials.project_id;

    auth = google.auth.fromJSON(credentials);

    auth.scopes = [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/iam',
    ];

    iam = google.iam('v1');

    const res = await iam.projects.serviceAccounts.create({
      auth,
      name: `projects/${projectId}`,
      resource: {
        accountId,
        serviceAccount: {
          displayName: `taskcluster-auth-test-${accountId}`,
        },
      },
    });

    account = res.data;
  });

  suiteTeardown(async () => {
    await iam.projects.serviceAccounts.delete({name: account.name, auth});
  });

  test('gcpCredentials invalid account', async () => {
    try {
      await helper.apiClient.gcpCredentials('invalidserviceaccount@mozilla.com');
      assert.fail('The call should fail');
    } catch (e) {
      assert.equal(e.statusCode, 404);
    }
  });

  test('gcpCredentials successful', async () => {
    await helper.apiClient.gcpCredentials(account.email);
  });

  test('gcpCredentials after setting policy', async () => {
    await helper.apiClient.gcpCredentials(account.email);
  });
});
