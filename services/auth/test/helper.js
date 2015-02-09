var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var v1          = require('../routes/api/v1');
var taskcluster = require('taskcluster-client');

// Load configuration
var cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/test'),
  filename:     'taskcluster-auth'
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
  var subject = {cfg: cfg};
  subject.testaccount = _.keys(JSON.parse(cfg.get('auth:azureAccounts')))[0];

  // Skip tests if no AWS credentials is configured
  if (!cfg.get('azure:accountKey') ||
      !cfg.get('auth:root:accessToken') ||
      !cfg.get('influx:connectionString')) {
    console.log("Skip tests for " + options.title +
                " due to missing credentials!");
    return;
  }

  // Configure server
  var server = new base.testing.LocalApp({
    command:      path.join(__dirname, '..', 'bin', 'server.js'),
    args:         ['test'],
    name:         'server.js',
    baseUrlPath:  '/v1'
  });

  // Hold reference to all listeners created with `subject.listenFor`
  var listeners = [];

  // Setup server
  setup(function() {
    // Utility function to listen for a message
    // Return an object with two properties/promises:
    // {
    //   ready:   Promise,  // Resolved when we've started to listen
    //   message: Promise   // Resolved when we've received a message
    // }
    subject.listenFor = function(binding) {
      // Create listener
      var listener = new taskcluster.AMQPListener({
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
      return {
        ready:      listener.resume(),
        message:    gotMessage
      };
    };
    // Set root credentials on subject
    // (so we only have to hardcode it in test.js)
    subject.root = cfg.get('auth:root');
    // Create server
    return server.launch().then(function(baseUrl) {
      // Create client for working with API
      subject.baseUrl = baseUrl;
      var reference = v1.reference({baseUrl: baseUrl});
      subject.Auth = taskcluster.createClient(reference);
      subject.auth = new subject.Auth({
        baseUrl:          baseUrl,
        credentials:      cfg.get('auth:root')
      });

      /*
      // Create client for binding to reference
      var exchangeReference = exchanges.reference({
        exchangePrefix:   cfg.get('auth:exchangePrefix')
      });
      subject.AuthEvents = taskcluster.createClient(exchangeReference);
      subject.authEvents = new subject.AuthEvents();
      */
    });
  });

  // Shutdown server
  teardown(function() {
    // Kill server
    return server.terminate().then(function() {
      return Promise.all(listeners.map(function(listener) {
        return listener.close();
      })).then(function() {
        listeners = [];
      });
    });
  });

  return subject;
};
