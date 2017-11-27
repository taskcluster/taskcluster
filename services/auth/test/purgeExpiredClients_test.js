suite('Client.purgeExpired', function() {
  var helper      = require('./helper');
  var assume      = require('assume');
  var taskcluster = require('taskcluster-client');

  const CLIENT_ID = 'nobody/sds:ad_asd/df-sAdSfchsdfsdfs';

  setup(async () => {
    await helper.auth.deleteClient(CLIENT_ID);
  });

  const testClient = async ({expires, deleteOnExpiration}) => {
    await helper.auth.createClient(CLIENT_ID, {
      expires: taskcluster.fromNow(expires),
      description: 'test',
      deleteOnExpiration,
    });
  };

  const assertClientPresent = async () => {
    let client = await helper.auth.client(CLIENT_ID);
    assume(client.clientId).to.equal(CLIENT_ID);
  };

  const assertClientAbsent = async () => {
    try {
      await helper.auth.client(CLIENT_ID);
    } catch (err) {
      assume(err.statusCode).to.equal(404);
      return;
    }
    throw new Error('client should be absent');
  };

  test('does not delete unexpired clients', async () => {
    await testClient({expires: '1 hour', deleteOnExpiration: true});
    await helper.Client.purgeExpired(new Date());
    await assertClientPresent();
  });

  test('does not delete expired clients with !deleteOnExpiration', async () => {
    await testClient({expires: '1 hour', deleteOnExpiration: false});
    await helper.Client.purgeExpired(taskcluster.fromNow('2 hours'));
    await assertClientPresent();
  });

  test('deletes expired clients with deleteOnExpiration', async () => {
    await testClient({expires: '1 hour', deleteOnExpiration: true});
    await helper.Client.purgeExpired(taskcluster.fromNow('2 hours'));
    await assertClientAbsent();
  });

});
