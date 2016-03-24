let assert          = require('assert');
let Promise         = require('promise');
let path            = require('path');
let _               = require('lodash');
let base            = require('taskcluster-base');
let taskcluster     = require('taskcluster-client');
let mocha           = require('mocha');
let debug           = require('debug')('test:helper');
let v1              = require('../lib/api');
let exchanges       = require('../lib/exchanges');
let load            = require('../lib/main');

const profile = 'test';
let loadOptions = {profile, process: 'test'};

// Create and export helper object
var helper = module.exports = {load, loadOptions};

// Load configuration
var cfg = base.config({profile});

// Configure PulseTestReceiver
helper.events = new base.testing.PulseTestReceiver(cfg.pulse, mocha);

// Allow tests to run expire-artifacts
helper.expireArtifacts = () => load('expire-artifacts', loadOptions);

// Allow tests to run expire-tasks
helper.expireTasks = () => load('expire-tasks', loadOptions);

// Allow tests to run expire-task-groups
helper.expireTaskGroups = () => load('expire-task-groups', loadOptions);

// Allow tests to run expire-task-group-members
helper.expireTaskGroupMembers = () => {
  return load('expire-task-group-members', loadOptions);
};

// Allow tests to run expire-task-requirement
helper.expireTaskRequirement = () => {
  return load('expire-task-requirement', loadOptions);
};

// Allow tests to run expire-task-dependency
helper.expireTaskDependency = () => {
  return load('expire-task-dependency', loadOptions);
};

// Allow tests to run expire-queues
helper.expireQueues = () => load('expire-queues', loadOptions);

// Process to terminate
var toTerminate = [];

// Allow tests to start claim-reaper
helper.claimReaper = async () => {
  var reaper = await load('claim-reaper', loadOptions);
  toTerminate.push(reaper);
  return reaper;
};
// Allow tests to start dependency-resolver
helper.dependencyResolver = async () => {
  var resolver = await load('dependency-resolver', loadOptions);
  toTerminate.push(resolver);
  return resolver;
};
// Allow tests to start deadline-reaper
helper.deadlineReaper = async () => {
  var reaper = await load('deadline-reaper', loadOptions)
  toTerminate.push(reaper);
  return reaper;
};

var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  debug("### Creating mock authentication server")
  base.testing.fakeauth.start({
    'test-server': ['*'],
    'test-client': ['*']
  });

  webServer = await load('server', loadOptions);

  // Create client for working with API
  debug("### Creating client")
  helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
  var reference = v1.reference({baseUrl: helper.baseUrl});
  helper.Queue = taskcluster.createClient(reference);
  // Utility to create an Queue instance with limited scopes
  helper.scopes = (...scopes) => {
    helper.queue = new helper.Queue({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent:            require('http').globalAgent,
      baseUrl:          helper.baseUrl,
      credentials: {
        clientId:       'test-client',
        accessToken:    'none'
      },
      authorizedScopes: (scopes.length > 0 ? scopes : undefined)
    });
  };

  // Initialize queue client
  helper.scopes();

  // Create client for binding to reference
  var exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.app.exchangePrefix,
    credentials:      cfg.pulse
  });
  helper.QueueEvents = taskcluster.createClient(exchangeReference);
  helper.queueEvents = new helper.QueueEvents();
});

// Setup before each test
mocha.beforeEach(() => {
  // Setup client with all scopes
  helper.scopes();
  // Reset list of processes to terminate
  toTerminate = [];
});

mocha.afterEach(async () => {
  // Terminate process that we started in this test
  await Promise.all(toTerminate.map((proc) => {
    return proc.terminate();
  }));
  toTerminate = [];
});

// Cleanup after tests
mocha.after(async () => {
  // Kill webServer
  await webServer.terminate();
  base.testing.fakeauth.stop();
});
