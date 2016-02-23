var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var base        = require('taskcluster-base');
var mocha       = require('mocha');
var v1          = require('../routes/api/v1');
var taskcluster = require('taskcluster-client');
var load        = require('../bin/server');

// Load configuration
const profile = 'test';
let loadOptions = {profile, process: 'test'};
var cfg = base.config({profile});

// Create helper to be tested by test
var helper = module.exports = {};

// Skip tests if no AWS credentials is configured
if (!cfg.app.azureAccount ||
    !cfg.taskcluster.credentials.accessToken ||
    !cfg.pulse.password) {
  console.log("Skip tests due to missing credentials!");
  process.exit(1);
}

// Hold reference to all listeners created with `helper.listenFor`
var listeners = [];

// Hold reference to servers
var server = null;
var handlers = null;

var testclients = {
  'test-client': ['*'],
};

// Setup server
mocha.before(async () => {
  await base.testing.fakeauth.start(testclients);
  server = await load('server', loadOptions);
  handlers = await load('handlers', loadOptions);

  // Utility function to listen for a message
  helper.listenFor = function(binding) {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:        cfg.pulse
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
  helper.routePrefix = cfg.app.routePrefix;
  // Create client for working with API
  let baseUrl = 'http://localhost:' + server.address().port + '/v1';
  helper.baseUrl = baseUrl;
  var reference = v1.reference({baseUrl: baseUrl});
  helper.Index = taskcluster.createClient(reference);
  helper.index = new helper.Index({
    baseUrl:          baseUrl,
    credentials:      {
      clientId: 'test-client',
      accessToken: 'none'
    }
  });

  // Create queueEvents and Queue client
  helper.queue = new taskcluster.Queue({
    credentials: cfg.taskcluster.credentials
  });
  helper.queueEvents = new taskcluster.QueueEvents();
});

mocha.after(async () => {
  if (server) {
    await server.terminate();
  }
  if (handlers) {
    await handlers.terminate();
  }
  base.testing.fakeauth.stop();
});
