import assert from 'assert';
import base from 'taskcluster-base';
import api from '../lib/api';
import taskcluster from 'taskcluster-client';
import mocha from 'mocha';
import common from '../lib/common';
import testing from 'taskcluster-lib-testing';
var bin = {
  server: require('../bin/server'),
  expireSecrets: require('../bin/expire-secrets')
};

// Create and export helper object
var helper = module.exports = {};

// Allow tests to run expire-secrets
helper.expireSecrets = () => {
  return bin.expireSecrets('test');
};

// Load configuration
var cfg = common.loadConfig('test');
const baseUrl = cfg.get('server:publicUrl') + '/v1';

// Skip tests if no credentials are configured
if (!cfg.get('taskcluster:credentials:accessToken') ||
    !cfg.get('taskcluster:credentials:clientId')) {
  console.log("Skip tests due to missing taskcluster credentials!");
  process.exit(1);
}

if (!cfg.get('azure:accountName')) {
  console.log("Skip tests due to missing azure accountName!");
  process.exit(1);
}

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
      'secrets:get:captain:*'
    ],
  }, {
    clientId:     'captain-read-limited',
    scopes:       [
      'secrets:get:captain:limited/*'
    ],
  }
];

var SecretsClient = taskcluster.createClient(
  api.reference({baseUrl: baseUrl})
);

var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Set up all of our clients, each with a different clientId
  helper.clients = {};
  var auth = {};
  for (let client of testClients) {
    helper.clients[client.clientId] = new SecretsClient({
      baseUrl:          baseUrl,
      credentials:      {clientId: client.clientId, accessToken: 'unused'},
    });
    auth[client.clientId] = client.scopes;
  }
  testing.fakeauth.start(auth);

  // start up the secrets service so that we can test it live
  webServer = await bin.server('test')
});

// Cleanup after tests
mocha.after(async () => {
  testing.fakeauth.stop()
  await webServer.terminate();
});

