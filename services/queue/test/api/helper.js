var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var dropdb      = require('../../bin/dropdb');
var v1          = require('../../routes/api/v1');
var exchanges   = require('../../queue/exchanges');
var taskcluster = require('taskcluster-client');

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

/** Return a promise that sleeps for `delay` ms before resolving */
exports.sleep = function(delay) {
  new Promise(function(accept) {
    setTimeout(accept, delay);
  });
}

/** Setup testing */
exports.setup = function(options) {
  // Provide default configuration
  options = _.defaults(options || {}, {
    title:      'untitled test',
    profile:    'test',
    clients:    []
  });

  // Add clients
  options.clients = (options.clients || []).concat(defaultClients);

  // Create subject to be tested by test
  var subject = {};

  // Load configuration
  var cfg = subject.cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + options.profile),
    envs: [
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'azure_accountName',
      'azure_accountKey',
      'amqp_url'
    ],
    filename:     'taskcluster-queue'
  });

  // Skip tests if no AWS credentials is configured
  if (!cfg.get('aws:secretAccessKey') ||
      !cfg.get('azure:accountKey') ||
      !cfg.get('amqp:url')) {
    console.log("Skip tests for " + options.title +
                " due to missing credentials!");
    return;
  }

  // Configure server
  var server = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', '..', 'bin', 'server.js'),
    args:         [options.profile],
    name:         'server.js',
    baseUrlPath:  '/v1'
  });

  // Configure reaper
  var reaper = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', '..', 'bin', 'reaper.js'),
    args:         [options.profile],
    name:         'reaper.js'
  });

  // Hold reference to mockAuthServer
  var mockAuthServer = null;

  // Hold reference to all listeners created with `subject.listenFor`
  var listeners = [];

  // Setup server
  setup(function() {
    // Utility function to listen for a message
    subject.listenFor = function(binding) {
      // Create listener
      var listener = new taskcluster.Listener({
        connectionString:   cfg.get('amqp:url')
      });
      // Track it, so we can close it in teardown()
      listeners.push(listener);
      // Bind to binding
      listener.bind(binding);
      // Wait for a message
      var gotMessage = new Promise(function(accept, reject) {
        listener.on('message', accept);
        listener.on('error', reject);
      });
      // Connect to AMQP server
      return listener.connect().then(function() {
        return listener.resume().then(function() {
          return gotMessage;
        });
      });
    };
    // Drop database
    return dropdb(options.profile).then(function() {
      // Create mock authentication server
      return base.testing.createMockAuthServer({
        port:     60007, // This is hardcoded into config/test.js
        clients:  options.clients
      }).then(function(mockAuthServer_) {
        mockAuthServer = mockAuthServer_;
      });
    }).then(function() {
      // Launch reaper
      var reaperLaunched = Promise.resolve(null);
      if (options.startReaper) {
        reaperLaunched = reaper.launch();
      }

      // Launch server
      var serverLaunched = server.launch().then(function(baseUrl) {
        // Create client for working with API
        subject.baseUrl = baseUrl;
        var reference = v1.reference({baseUrl: baseUrl});
        subject.Queue = taskcluster.createClient(reference);
        // Utility to create an Queue instance with limited scopes
        subject.scopes = function() {
          var scopes = Array.prototype.slice.call(arguments);
          subject.queue = new subject.Queue({
            baseUrl:          baseUrl,
            credentials: {
              clientId:       'test-client',
              accessToken:    'none'
            },
            authorizedScopes: (scopes.length > 0 ? scopes : undefined)
          });
        };
        subject.scopes();
        // Create client for binding to reference
        var exchangeReference = exchanges.reference({
          exchangePrefix:   cfg.get('queue:exchangePrefix')
        });
        subject.QueueEvents = taskcluster.createClient(exchangeReference);
        subject.queueEvents = new subject.QueueEvents();
      });

      return Promise.all([serverLaunched, reaperLaunched]);
    });
  });

  // Shutdown server
  teardown(function() {
    // Kill reaper if needed
    var reaperDead = Promise.resolve(null);
    if (options.startReaper) {
      reaperDead = reaper.terminate();
    }
    // Kill server
    var serverDead = server.terminate();
    return Promise.all([reaperDead, serverDead]).then(function() {
      return mockAuthServer.terminate();
    }).then(function() {
      return Promise.all(listeners.map(function(listener) {
        return listener.close();
      })).then(function() {
        listeners = [];
      });
    });
  });

  return subject;
};
