var assert      = require('assert');
var http        = require('http');
var Promise     = require('promise');
var path        = require('path');
var fs          = require('fs');
var _           = require('lodash');
var base        = require('taskcluster-base');
var api         = require('../lib/api');
var taskcluster = require('taskcluster-client');
var mocha       = require('mocha');
var exchanges   = require('../lib/exchanges');
var common      = require('../lib/common');
var bin = {
  server:         require('../bin/server'),
};

// Load configuration
var cfg = common.loadConfig('test');

// Some default clients for the mockAuthServer
var defaultClients = [
  {
  clientId:     'test-server',  // Hardcoded into config/test.js
  accessToken:  'none',
  scopes:       ['auth:credentials'],
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

// Turn integration tests on or off depending on pulse credentials being set
helper.canRunIntegrationTests = true;
if (!cfg.get('pulse:password')) {
  helper.canRunIntegrationTests = false;
  console.log("No pulse credentials: integration tests will be skipped.");
}

// Build an http request from a json file with fields describing
// headers and a body
helper.jsonHttpRequest = function(jsonFile, options) {
  let defaultOptions = {
      hostname: 'localhost',
      port: cfg.get('server:port'),
      path: '/v1/github',
      method: 'POST',
  }
  if (options === undefined) {
      options = defaultOptions
  } else {
      let mergedOptions = {};
      for (var k in defaultOptions) { mergedOptions[k] = defaultOptions[k]; }
      for (var k in options) { mergedOptions[k] = options[k]; }
      options = mergedOptions;
  }
  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;
  return new Promise(function(accept, reject) {
      try {
          let req = http.request(options, accept)
          req.write(JSON.stringify(jsonData.body))
          req.end()
      } catch(e) {
          reject(e)
      }
  });
};

// Hold reference to authServer
var authServer = null;
var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  authServer = await base.testing.createMockAuthServer({
  port:     cfg.get('taskcluster:authPort'),
  clients:  defaultClients
  });

  helper.validator = await common.buildValidator(cfg);

  // Skip tests if no credentials are configured
  if (!helper.canRunIntegrationTests) {
    // Start a web server with custom publishers (mocked pulse)
    let stubbedPublisher = (data) => {
      return Promise.resolve(data);
    };

    webServer = await bin.server('test', {
      pullRequest: stubbedPublisher,
      push: stubbedPublisher,
    });
  } else {
    // Start a normal webserver, with pulse publisher
    webServer = await bin.server('test')

    // Configure PulseTestReceiver
    helper.events = new base.testing.PulseTestReceiver(cfg.get('pulse'), mocha);
    // Create client for binding to reference
    var exchangeReference = exchanges.reference({
      exchangePrefix:   cfg.get('taskclusterGithub:exchangePrefix'),
      credentials:      cfg.get('pulse')
    });
    helper.TaskclusterGitHubEvents = taskcluster.createClient(exchangeReference);
    helper.taskclusterGithubEvents = new helper.TaskclusterGitHubEvents();
  }
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  await authServer.terminate();
});
