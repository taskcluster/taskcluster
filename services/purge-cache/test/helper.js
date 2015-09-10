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
  server:         require('../bin/server'),
};

// Load configuration
var cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/test'),
  envs: [
    'pulse_username',
    'pulse_password',
    'purgeCache_publishMetaData',
    'taskcluster_credentials_clientId',
    'taskcluster_credentials_accessToken',
    'aws_accessKeyId',
    'aws_secretAccessKey',
    'influx_connectionString'
  ],
  filename:     'taskcluster-purge-cache'
});

// Some default clients for the mockAuthServer
var defaultClients = [
  {
    clientId:     'test-server',  // Hardcoded into config/test.js
    accessToken:  'none',
    scopes:       [],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }, {
    clientId:     'test-client',
    accessToken:  'none',
    scopes:       ['*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }
];

// Create and export helper object
var helper = module.exports = {};

// Skip tests if no credentials is configured
if (!cfg.get('pulse:password')) {
  console.log("Skip tests due to missing credentials!");
  process.exit(1);
}

// Configure PulseTestReceiver
helper.events = new base.testing.PulseTestReceiver(cfg.get('pulse'), mocha);

// Hold reference to authServer
var authServer = null;
var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  authServer = await base.testing.createMockAuthServer({
    port:     60414, // This is hardcoded into config/test.js
    clients:  defaultClients
  });

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
    exchangePrefix:   cfg.get('purgeCache:exchangePrefix'),
    credentials:      cfg.get('pulse')
  });
  helper.PurgeCacheEvents = taskcluster.createClient(exchangeReference);
  helper.purgeCacheEvents = new helper.PurgeCacheEvents();
});

// Setup before each test
mocha.beforeEach(() => {
  // Setup client with all scopes
  helper.scopes();
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  await authServer.terminate();
});