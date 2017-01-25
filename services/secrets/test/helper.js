import assert from 'assert';
import api from '../lib/api';
import taskcluster from 'taskcluster-client';
import mocha from 'mocha';
import testing from 'taskcluster-lib-testing';
import load from '../bin/main';
import config from 'typed-env-config';

// Create and export helper object
var helper = module.exports = {};

// Load configuration
var cfg = config({profile: 'test'});
const baseUrl = cfg.server.publicUrl + '/v1';

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

  // create the Azure table
  let entity = await load('entity', {profile: 'test', process: 'test'});
  await entity.ensureTable();

  // start up the secrets service so that we can test it live
  webServer = await load('server', {profile: 'test', process: 'test'});
});

// Cleanup after tests
mocha.after(async () => {
  testing.fakeauth.stop()
  await webServer.terminate();
});

