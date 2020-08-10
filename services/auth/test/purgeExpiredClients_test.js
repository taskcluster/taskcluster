const helper = require('./helper');
const assume = require('assume');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServers(mock, skipping);

  const CLIENT_ID = 'nobody/sds:ad_asd/df-sAdSfchsdfsdfs';

  setup(async () => {
    await helper.apiClient.deleteClient(CLIENT_ID);
    await helper.load.remove('purge-expired-clients');
  });

  const testClient = async ({ expires, deleteOnExpiration }) => {
    await helper.apiClient.createClient(CLIENT_ID, {
      expires: taskcluster.fromNow(expires),
      description: 'test',
      deleteOnExpiration,
    });
  };

  const assertClientPresent = async () => {
    let client = await helper.apiClient.client(CLIENT_ID);
    assume(client.clientId).to.equal(CLIENT_ID);
  };

  const assertClientAbsent = async () => {
    try {
      await helper.apiClient.client(CLIENT_ID);
    } catch (err) {
      assume(err.statusCode).to.equal(404);
      return;
    }
    throw new Error('client should be absent');
  };

  test('does not delete unexpired clients', async () => {
    await testClient({ expires: '1 hour', deleteOnExpiration: true });
    await helper.load('purge-expired-clients');
    await assertClientPresent();
  });

  test('does not delete expired clients with !deleteOnExpiration', async () => {
    await testClient({ expires: '-1 hour', deleteOnExpiration: false });
    await helper.load('purge-expired-clients');
    await assertClientPresent();
  });

  test('deletes expired clients with deleteOnExpiration', async () => {
    await testClient({ expires: '-1 hour', deleteOnExpiration: true });
    await helper.load('purge-expired-clients');
    await assertClientAbsent();
  });
});
