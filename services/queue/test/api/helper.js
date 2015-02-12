var assert          = require('assert');
var Promise         = require('promise');
var path            = require('path');
var _               = require('lodash');
var base            = require('taskcluster-base');
var v1              = require('../../routes/v1');
var exchanges       = require('../../queue/exchanges');
var taskcluster     = require('taskcluster-client');
var mocha           = require('mocha');
var bin = {
  server:             require('../../bin/server'),
  expireArtifacts:    require('../../bin/expire-artifacts'),
  claimReaper:        require('../../bin/claim-reaper'),
  deadlineReaper:     require('../../bin/deadline-reaper')
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

module.exports = function(options) {
  options = options || {};

  // Create helper
  var helper = {};

  // Load configuration
  var cfg = helper.cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + testProfile),
    envs: [
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'azure_accountName',
      'azure_accountKey',
      'pulse_username',
      'pulse_password'
    ],
    filename:     'taskcluster-queue'
  });

  // Skip tests if no AWS credentials is configured
  if (!cfg.get('aws:secretAccessKey') ||
      !cfg.get('azure:accountKey') ||
      !cfg.get('pulse:password')) {
    console.log("Skip tests due to missing credentials!");
    return;
  }

  // Configure PulseTestReceiver
  helper.events = new base.testing.PulseTestReceiver(cfg.get('pulse'), mocha);

  // Allow tests to run expire-artifacts
  helper.expireArtifacts = () => {
    return bin.expireArtifacts(testProfile);
  };

  // Process to terminate
  var toTerminate = [];

  // Allow tests to start claim-reaper
  helper.claimReaper = async () => {
    var reaper = await bin.claimReaper(testProfile);
    toTerminate.push(reaper);
    return reaper;
  };
  // Allow tests to start deadline-reaper
  helper.deadlineReaper = async () => {
    var reaper = await bin.deadlineReaper(testProfile);
    toTerminate.push(reaper);
    return reaper;
  };

  // Hold reference to authServer
  var authServer = null;
  var webServer = null;

  // Setup server
  setup(async function() {
    // Create mock authentication server
    authServer = await base.testing.createMockAuthServer({
      port:     60407, // This is hardcoded into config/test.js
      clients:  defaultClients
    });

    webServer = await bin.server(testProfile);

    // Create client for working with API
    helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
    var reference = v1.reference({baseUrl: helper.baseUrl});
    helper.Queue = taskcluster.createClient(reference);
    // Utility to create an Queue instance with limited scopes
    helper.scopes = function() {
      var scopes = Array.prototype.slice.call(arguments);
      helper.queue = new helper.Queue({
        baseUrl:          helper.baseUrl,
        credentials: {
          clientId:       'test-client',
          accessToken:    'none'
        },
        authorizedScopes: (scopes.length > 0 ? scopes : undefined)
      });
    };

    helper.scopes();
    // Create client for binding to reference
    var exchangeReference = exchanges.reference({
      exchangePrefix:   cfg.get('queue:exchangePrefix'),
      credentials:      cfg.get('pulse')
    });
    helper.QueueEvents = taskcluster.createClient(exchangeReference);
    helper.queueEvents = new helper.QueueEvents();
  });

  // Shutdown server
  teardown(async function() {
    await Promise.all(toTerminate.map((proc) => {
      return proc.terminate();
    }));
    toTerminate = [];
    // Kill webServer
    await webServer.terminate();
    await authServer.terminate();
  });

  return helper;
};
