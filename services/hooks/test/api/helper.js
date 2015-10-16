var _           = require('lodash');
var assert      = require('assert');
var base        = require('taskcluster-base');
var data        = require('../../hooks/data');
var debug       = require('debug')('test:api:helper');
var path        = require('path');
var Promise     = require('promise');
var taskcluster = require('taskcluster-client');
var v1          = require('../../routes/v1');
var bin = {
  server:             require('../../bin/server')
};

var testProfile = 'test';

// Create and export helper object
var helper = module.exports = {};

// Load configuration
var cfg = helper.cfg = base.config({
  defaults:     require('../../config/defaults'),
  profile:      require('../../config/' + testProfile),
  envs: [
    'pulse_username',
    'pulse_password',
    'taskcluster_credentials_clientId',
    'taskcluster_credentials_accessToken',
    'azure_accountName',
    'azure_accountKey'
  ],
  filename:     'taskcluster-hooks'
});

// Some default clients for the mockAuthServer
var defaultClients = [
  {
    // Loaded from config so we can authenticated against the real queue
    // Note that we still use a mock auth server to avoid having the scope
    // auth:credentials assigned to our test client
    clientId:     cfg.get('taskcluster:credentials:clientId'),
    accessToken:  cfg.get('taskcluster:credentials:accessToken'),
    scopes:       ['auth:*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }, {
    clientId:     'test-client',  // Used in default Hooks creation
    accessToken:  'none',
    scopes:       ['*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }
];

// Call this in suites or tests that make API calls; it will set up
// what's required to respond to those calls.  But note that this
// requires credentials (taskcluster-hooks.conf.json); returns false
// if those credentials are not available.
helper.setupApi = function() {
  if (!cfg.get('azure:accountName')) {
    return false;
  }

  // Hold reference to authServer
  var authServer = null;
  var webServer = null;

  // Setup before tests
  suiteSetup(async () => {
    // Create mock authentication server
    authServer = await base.testing.createMockAuthServer({
      port: 60407,
      clients:  defaultClients,
      credentials: cfg.get('taskcluster:credentials')
    });

    // Create Hooks table
    helper.Hook = data.Hook.setup({
      table:        cfg.get('hooks:hookTableName'),
      credentials:  cfg.get('azure'),
      process:      'testing'
    });

    webServer = await bin.server(testProfile);

    // Create client for working with API
    helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
    var reference = v1.reference({baseUrl: helper.baseUrl});
    helper.Hooks = taskcluster.createClient(reference);
    // Utility to create an Hooks instance with limited scopes
    helper.scopes = (...scopes) => {
      helper.hooks = new helper.Hooks({
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent:            require('http').globalAgent,
        baseUrl:          helper.baseUrl,
        credentials: {
          clientId:       'test-client',
          accessToken:    'none'
        },
        //authBaseUrl: cfg.get('taskcluster:authBaseUrl'),
        authorizedScopes: (scopes.length > 0 ? scopes : undefined)
      });
    };

    // Initialize queue client
    helper.scopes();
  });

  // Setup before each test
  setup(async () => {
    // Remove all entities before each test
    await helper.Hook.scan({},{handler: hook => {return hook.remove();}});

    // Setup client with all scopes
    helper.scopes();
  });

  // Cleanup after tests
  suiteTeardown(async () => {
    // Kill webServer
    await webServer.terminate();
    await authServer.terminate();
  });

  return true;
};
