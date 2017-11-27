var assert      = require('assert');
var path        = require('path');
var _           = require('lodash');
var mocha       = require('mocha');
var api          = require('../src/api');
var taskcluster = require('taskcluster-client');
var load        = require('../src/main');
var Config      = require('typed-env-config');
var testing     = require('taskcluster-lib-testing');

// Load configuration
const profile = 'test';
var cfg = Config({profile});

// Create helper to be tested by test
var helper = module.exports = {};

// Hold reference to all listeners created with `helper.listenFor`
var listeners = [];

// Hold reference to servers
var server = null;
helper.handlers = null;

var testclients = {
  'index-server': ['*'],
  'test-client': ['*'],
  'public-only-client': [], // no scopes at all
};

// make a queue object with some methods stubbed
var stubbedQueue = () => {
  var queue = new taskcluster.Queue({
    credentials:      {
      clientId: 'index-server',
      accessToken: 'none',
    },
  });
  var tasks = {};

  queue.task = async function(taskId) {
    var task = tasks[taskId];
    assert(task, `fake queue has no task ${taskId}`);
    return task;
  };

  queue.addTask = function(taskId, task) {
    tasks[taskId] = task;
  };

  return queue;
};

// Setup server
mocha.before(async () => {
  await testing.fakeauth.start(testclients);

  let loadOptions = {profile, process: 'test'};

  // initialize the tables
  loadOptions.IndexedTask = await load('IndexedTask', loadOptions);
  await loadOptions.IndexedTask.ensureTable();
  loadOptions.Namespace = await load('Namespace', loadOptions);
  await loadOptions.Namespace.ensureTable();

  // set up a fake queue
  helper.queue = loadOptions.queue = stubbedQueue();

  // and load everything up
  server = loadOptions.server = await load('server', loadOptions);
  helper.handlers = loadOptions.handlers = await load('handlers', loadOptions);

  // Utility function to listen for a message
  helper.listenFor = function(binding) {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:        cfg.pulse,
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
  var reference = api.reference({baseUrl: baseUrl});
  helper.Index = taskcluster.createClient(reference);
  helper.index = new helper.Index({
    baseUrl:          baseUrl,
    credentials:      {
      clientId: 'test-client',
      accessToken: 'none',
    },
  });

  // Create queueEvents
  helper.queueEvents = new taskcluster.QueueEvents();
});

mocha.after(async () => {
  if (server) {
    await server.terminate();
  }
  if (helper.handlers) {
    await helper.handlers.terminate();
    helper.handlers = null;
  }
  testing.fakeauth.stop();
});
