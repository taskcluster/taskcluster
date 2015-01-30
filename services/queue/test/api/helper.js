var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var v1          = require('../../routes/v1');
var exchanges   = require('../../queue/exchanges');
var taskcluster = require('taskcluster-client');
var mocha       = require('mocha');
var server      = require('../../bin/server');

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

var defaultProfile = 'test';

module.exports = function(options) {
  options = options || {};

  // Create helper
  var helper = {};

  // Return a promise that sleeps for `delay` ms before resolving
  helper.sleep = function(delay) {
    return new Promise(function(accept) {
      setTimeout(accept, delay);
    });
  };

  /** Poll a function that returns a promise, until it resolves */
  helper.poll = function(doPoll, attempts, interval) {
    attempts = attempts || 90;
    interval = interval || 1000;
    var pollAgain = function() {
      return doPoll().catch(function(err) {
        if (attempts > 0) {
          attempts -= 1;
          return helper.sleep(interval).then(function() {
            return pollAgain();
          });
        }
        throw err;
      });
    };
    return pollAgain();
  };

  // Load configuration
  var cfg = helper.cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + defaultProfile),
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


  // Hold reference to mockAuthServer
  var mockAuthServer = null;
  var web = null;

  // Setup server
  setup(async function() {
    // Create mock authentication server
    mockAuthServer = await base.testing.createMockAuthServer({
      port:     60007, // This is hardcoded into config/test.js
      clients:  defaultClients
    });

    web = await server(defaultProfile);

    // Create client for working with API
    helper.baseUrl = 'http://localhost:' + web.address().port + '/v1';
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
    // Kill server
    await web.terminate();
    await mockAuthServer.terminate();
  });

  return helper;
};
