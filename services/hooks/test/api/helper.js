var assert          = require('assert');
var Promise         = require('promise');
var path            = require('path');
var _               = require('lodash');
var base            = require('taskcluster-base');
var data            = require('../../hooks/data');
var v1              = require('../../routes/v1');
var taskcluster     = require('taskcluster-client');
var mocha           = require('mocha');
var bin = {
  server:             require('../../bin/server')
};

// Some default clients for the mockAuthServer
var defaultClients = [
  {
    clientId:     'test-server',  // Hardcoded into config/test.js
    accessToken:  'none',
    scopes:       ['auth:credentials', 'auth:can-delegate'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }, {
    clientId:     'test-client',  // Used in default Queue creation
    accessToken:  'none',
    scopes:       ['*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }
];

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

// Create Hooks table
var Hook = data.Hook.setup({
  table:        cfg.get('hooks:hookTableName'),
  credentials:  cfg.get('azure'),
  process:      'testing'
});

// Create Groups table
var Groups = data.Groups.setup({
  table:        cfg.get('hooks:groupsTableName'),
  credentials:  cfg.get('azure'),
  process:      'testing'
});

// Hold reference to authServer
var authServer = null;
var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  authServer = await base.testing.createMockAuthServer({
    port:     60407, // This is hardcoded into config/test.js
    clients:  defaultClients
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
      authorizedScopes: (scopes.length > 0 ? scopes : undefined)
    });
  };

  // Initialize queue client
  helper.scopes();
});

var toTerminate = [];

// Setup before each test
mocha.beforeEach(async () => {
  // Remove all hooks and groups
  let hooks = await Hook.scan({}, {});
  await Promise.all(hooks.entries.map((hook) => {
    return hook.remove();
  }));

  let groups = await Groups.scan({}, {});
  await Promise.all(groups.entries.map((group) => {
    return group.remove();
  }));

  // Setup client with all scopes
  helper.scopes();
  // Reset list of processes to terminate
  toTerminate = [];
});

mocha.afterEach(async () => {
  // Terminate process that we started in this test
  await Promise.all(toTerminate.map((proc) => {
    return proc.terminate();
  }));
  toTerminate = [];
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  await authServer.terminate();
});
