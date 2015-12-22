import assert from 'assert';
import base from 'taskcluster-base';
import api from '../lib/api';
import taskcluster from 'taskcluster-client';
import mocha from 'mocha';
import common from '../lib/common';
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

// All client shoulds expire within a minute
const ClientExpiration = new Date((new Date()).getTime() + (60 * 1000));

// Some clients for the tests, with differents scopes.  These are turned
// into temporary credentials based on the main test credentials, so
// the clientIds listed here are purely internal to the tests.
var testClients = [
  {
    clientId:     'captain-write', // can write captain's secrets
    scopes:       [
      'secrets:set:captain:*',
      'secrets:update:captain:*',
      'secrets:remove:captain:*'
    ],
    expiry:       ClientExpiration,
    credentials:  cfg.get('taskcluster:credentials')
  }, {
    clientId:     'captain-read', // can read captain's secrets
    accessToken:  'none',
    scopes:       ['secrets:get:captain:*'],
    expiry:       ClientExpiration,
    credentials:  cfg.get('taskcluster:credentials')
  }, {
    clientId:     'captain-read-write',
    scopes:       [
      'secrets:set:captain:*',
      'secrets:update:captain:*',
      'secrets:remove:captain:*',
      'secrets:get:captain:*'
    ],
    expiry:       ClientExpiration,
    credentials:  cfg.get('taskcluster:credentials')
  }
];

var webServer = null;

var SecretsClient = taskcluster.createClient(
  api.reference({baseUrl: baseUrl})
);

// Set up all of our clients
helper.clients = {};
for (let client of testClients) {
  helper.clients[client.clientId] = new SecretsClient({
    baseUrl:          baseUrl,
    credentials: taskcluster.createTemporaryCredentials(client),
    authorizedScopes: client.scopes
  });
};

// Setup before tests
mocha.before(async () => {
  webServer = await bin.server('test')
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
});
