
const {fakeauth} = require('taskcluster-lib-testing');
const client = require('taskcluster-client');
const builder = require('../lib/api');
const main = require('../lib/main');

const clientId = 'test-user';

async function getClient() {
  let clientClass = client.createClient(builder.reference());
  const cfg = await main('cfg', {profile: 'test', process: 'unit-tests'});
  return new clientClass({
    credentials: {
      clientId,
      accessToken: 'fake-token',
    },
    rootUrl: cfg.taskcluster.rootUrl,
  });
}

suiteSetup(async () => {
  const cfg = await main('cfg', {profile: 'test', process: 'unit-tests'});
  let clients = {};
  clients[clientId] = ['*'];
  fakeauth.start(clients, {rootUrl: cfg.taskcluster.rootUrl});
});

suiteTeardown(() => {
  fakeauth.stop();
});
module.exports = {
  client: getClient(),
  server: main('server', {profile: 'test', process: 'unit-tests'}),
};
