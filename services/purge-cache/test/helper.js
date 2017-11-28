let assert      = require('assert');
let path        = require('path');
let _           = require('lodash');
let api         = require('../src/api');
let taskcluster = require('taskcluster-client');
let mocha       = require('mocha');
let exchanges   = require('../src/exchanges');
let load        = require('../src/main');
let config      = require('typed-env-config');
let testing     = require('taskcluster-lib-testing');

// Load configuration
let cfg = config({profile: 'test'});

let testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

// Create and export helper object
let helper = module.exports = {};

// Skip tests if no credentials is configured
if (!cfg.pulse || !cfg.taskcluster) {
  console.log('Skip tests due to missing credentials!');
  process.exit(1);
}

// Configure PulseTestReceiver
helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);

// Hold reference to authServer
let authServer = null;
let webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  testing.fakeauth.start(testclients);

  await load('expire-cache-purges', {profile: 'test', process: 'test'});
  webServer = await load('server', {profile: 'test', process: 'test'});

  // Create client for working with API
  helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
  let reference = api.reference({baseUrl: helper.baseUrl});
  helper.PurgeCache = taskcluster.createClient(reference);
  // Utility to create an PurgeCache instance with limited scopes
  helper.scopes = (...scopes) => {
    helper.purgeCache = new helper.PurgeCache({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent:            require('http').globalAgent,
      baseUrl:          helper.baseUrl,
      credentials: {
        clientId:       'test-client',
        accessToken:    'none',
      },
      authorizedScopes: scopes.length > 0 ? scopes : undefined,
    });
  };

  // Initialize purge-cache client
  helper.scopes();

  // Create client for binding to reference
  let exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.app.exchangePrefix,
    credentials:      cfg.pulse,
  });
  helper.PurgeCacheEvents = taskcluster.createClient(exchangeReference);
  helper.purgeCacheEvents = new helper.PurgeCacheEvents();
});

mocha.beforeEach(() => {
  helper.scopes();
});

mocha.after(async () => {
  await webServer.terminate();
  testing.fakeauth.stop();
});
