var data        = require('../src/data');
var taskcluster = require('taskcluster-client');
var taskcreator = require('../src/taskcreator');
var testing     = require('taskcluster-lib-testing');
var v1          = require('../src/v1');
var load        = require('../src/main');
var config      = require('typed-env-config');
var _           = require('lodash');

var cfg = config({profile: 'test'});

var helper = module.exports = {};

helper.load = load;
helper.loadOptions = {profile: 'test', process: 'test-helper'};

helper.haveRealCredentials = !!cfg.taskcluster.credentials.accessToken;

// Call this in suites or tests that make API calls, hooks etc; it will set up
// what's required to respond to those calls.
helper.setup = function() {
  // Hold reference to authServer
  var authServer = null;
  var webServer = null;

  // Setup before tests
  suiteSetup(async () => {
    testing.fakeauth.start({
      'test-client': ['*'],
    });

    // Create Hooks table
    helper.Hook = await load('Hook', helper.loadOptions);

    // Create table and remove all entities before each test
    await helper.Hook.ensureTable();
    await helper.Hook.scan({}, {handler: hook => hook.remove()});

    helper.cfg = cfg;
    helper.creator = new taskcreator.MockTaskCreator();
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
          accessToken:    'none',
        },
        //authBaseUrl: cfg.get('taskcluster:authBaseUrl'),
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };
  });

  // Setup before each test
  setup(async () => {
    // Remove all entities before each test
    await helper.Hook.scan({}, {handler: hook => hook.remove()});

    // reset the list of fired tasks
    helper.creator.fireCalls = [];

    helper.creator.shouldFail = false;

    // Setup client with all scopes
    helper.scopes();
  });

  // Cleanup after tests
  suiteTeardown(async () => {
    // Kill webServer
    await webServer.terminate();
    testing.fakeauth.stop();
  });
};
