var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var api         = require('../lib/api');
var taskcluster = require('taskcluster-client');
var mocha       = require('mocha');
var exchanges   = require('../lib/exchanges');
var bin = {
  server:         require('../lib/main'),
};

// Load configuration
var cfg = base.config({profile: 'test'});

var testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

// Create and export helper object
var helper = module.exports = {};

// Skip tests if no credentials is configured
if (!cfg.pulse.password) {
  console.log("Skip tests due to missing credentials!");
  process.exit(1);
}

// Configure PulseTestReceiver
helper.events = new base.testing.PulseTestReceiver(cfg.pulse, mocha);

// Hold reference to authServer
var authServer = null;
var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  base.testing.fakeauth.start(testclients);

  webServer = await bin.server('test');

  // Create client for working with API
  helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
  var reference = api.reference({baseUrl: helper.baseUrl});
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
        accessToken:    'none'
      },
      authorizedScopes: (scopes.length > 0 ? scopes : undefined)
    });
  };

  // Initialize purge-cache client
  helper.scopes();

  // Create client for binding to reference
  var exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.purgeCache.exchangePrefix,
    credentials:      cfg.pulse
  });
  helper.PurgeCacheEvents = taskcluster.createClient(exchangeReference);
  helper.purgeCacheEvents = new helper.PurgeCacheEvents();
});

mocha.beforeEach(() => {
  helper.scopes();
});

mocha.after(async () => {
  await webServer.terminate();
  base.testing.fakeauth.stop();
});
