var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');

// Load configuration
var cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/localhost'),
  envs: [
    'taskcluster_credentials_clientId',
    'taskcluster_credentials_accessToken'
  ],
  filename:     'taskcluster-treeherder'
});

/** Return a promise that sleeps for `delay` ms before resolving */
exports.sleep = function(delay) {
  return new Promise(function(accept) {
    setTimeout(accept, delay);
  });
}

/** Setup testing */
exports.setup = function(options) {
  // Provide default configuration
  options = _.defaults(options || {}, {
    title:      'untitled test'
  });

  // Create subject to be tested by test
  var subject = {};

  // Skip tests if no AWS credentials is configured
  if (!cfg.get('taskcluster:credentials:accessToken')) {
    console.log("Skip tests for " + options.title +
                " due to missing credentials!");
    return;
  }

  // Configure handlers
  var handlers = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', 'bin', 'handlers.js'),
    args:         ['localhost'],
    name:         'handlers.js'
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
        // Resume immediately
        return listener.resume().then(function() {
          return gotMessage;
        });
      });
    };
    // Expose routePrefix to tests
    subject.routePrefix = cfg.get('treeherder:routePrefix');
    subject.treeherderBaseUrl = cfg.get('treeherder:baseUrl');
    subject.projects = cfg.get('treeherder:projects');
    // Launch handlers
    return handlers.launch().then(function() {
      // Create queueEvents and Queue client
      subject.queue = new taskcluster.Queue({
        credentials: cfg.get('taskcluster:credentials')
      });
      subject.queueEvents = new taskcluster.QueueEvents();
    });
  });

  // Shutdown server
  teardown(function() {
    // Kill handlers
    return handlers.terminate().then(function() {
      return Promise.all(listeners.map(function(listener) {
        return listener.close();
      })).then(function() {
        listeners = [];
      });
    });
  });

  return subject;
};
