var base        = require('taskcluster-base');
var data        = require('../hooks/data');
var taskcluster = require('taskcluster-client');
var taskcreator = require('../hooks/taskcreator');
var v1          = require('../routes/v1');
var load        = require('../bin/main');
var config      = require('typed-env-config');
var _           = require('lodash');

var cfg = config({profile: 'test'});


var defaultClients = [
  {
    // Loaded from config so we can authenticated against the real queue
    // Note that we still use a mock auth server to avoid having the scope
    // hooks:* assigned to our test client
    clientId:     cfg.taskcluster.credentials.clientId,
    accessToken:  cfg.taskcluster.credentials.accessToken,
    scopes:       ['hooks:*', 'auth:*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }, {
    clientId:     'test-client',  // Used in default Hooks client creation
    accessToken:  'none',
    scopes:       ['*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }
];

var helper = module.exports = {};

helper.load = load;
helper.loadOptions = {profile: 'test', process: 'test-helper'};


helper.hasTcCredentials = cfg.taskcluster.credentials.accessToken;


// Call this in suites or tests that make API calls, hooks etc; it will set up
// what's required to respond to those calls.  But note that this
// requires credentials (taskcluster-hooks.conf.json); returns false
// if those credentials are not available.
helper.setup = function() {
  if (!helper.hasTcCredentials) {
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
      credentials: cfg.taskcluster.credentials
    });
    // 500ms as coded into tc-base doesn't work, this need to live here until we
    // land a fix in tc-base (currently not brave enough to upgrade tc-base)
    authServer.setTimeout(30 * 1000);

    // Create Hooks table
    helper.Hook = await load('Hook', helper.loadOptions);

    // Remove all entities before each test
    await helper.Hook.scan({}, {handler: hook => hook.remove()});

    helper.creator = new taskcreator.MockTaskCreator()
    webServer = await load('server', _.defaults({
      Hook: helper.Hook,
      taskcreator: helper.creator,
    }, helper.loadOptions));

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
    await helper.Hook.scan({}, {handler: hook => hook.remove()});

    // reset the list of fired tasks
    helper.creator.fireCalls = [];

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


