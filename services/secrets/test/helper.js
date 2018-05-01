const assert = require('assert');
const api = require('../src/api');
const taskcluster = require('taskcluster-client');
const mocha = require('mocha');
const {fakeauth, stickyLoader, Secrets} = require('taskcluster-lib-testing');
const load = require('../src/main');
const config = require('typed-env-config');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-secrets',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
  },
  load: exports.load,
});

// Some clients for the tests, with differents scopes.  These are turned
// into temporary credentials based on the main test credentials, so
// the clientIds listed here are purely internal to the tests.
var testClients = [
  {
    clientId:     'captain-write', // can write captain's secrets
    scopes:       [
      'secrets:set:captain:*',
    ],
  }, {
    clientId:     'captain-read', // can read captain's secrets
    accessToken:  'none',
    scopes:       ['secrets:get:captain:*'],
  }, {
    clientId:     'captain-read-write',
    scopes:       [
      'secrets:set:captain:*',
      'secrets:get:captain:*',
    ],
  }, {
    clientId:     'captain-read-limited',
    scopes:       [
      'secrets:get:captain:limited/*',
    ],
  },
];

// Setup before tests
suiteSetup(async () => {
  const auth = {};
  const cfg = await exports.load('cfg');
  const baseUrl = cfg.server.publicUrl + '/v1';
  const SecretsClient = taskcluster.createClient(api.reference({baseUrl}));

  exports.clients = {};
  for (let client of testClients) {
    exports.clients[client.clientId] = new SecretsClient({
      credentials:      {clientId: client.clientId, accessToken: 'unused'},
    });
    auth[client.clientId] = client.scopes;
  }
  fakeauth.start(auth);
});

// Cleanup after tests
suiteTeardown(async () => {
  fakeauth.stop();
});

