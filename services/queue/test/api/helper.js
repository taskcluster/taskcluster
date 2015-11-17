var assert          = require('assert');
var Promise         = require('promise');
var path            = require('path');
var _               = require('lodash');
var base            = require('taskcluster-base');
var v1              = require('../../routes/v1');
var exchanges       = require('../../queue/exchanges');
var taskcluster     = require('taskcluster-client');
var mocha           = require('mocha');
var load            = require('../../src/main');

// Some default clients for the mockAuthServer
var defaultClients = [
  {
    clientId:     'test-server',  // Hardcoded into config/test.js
    accessToken:  'none',
    scopes: [
      '*', // Needed to issue temp creds with task.scopes in (re)claimTask
      'queue:claim-task:*'  // Needed to issue temp creds in (re)claimTask
    ],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }, {
    clientId:     'test-client',  // Used in default Queue creation
    accessToken:  'none',
    scopes:       ['*'],
    expires:      new Date(3000, 0, 0, 0, 0, 0, 0)
  }
];

const profile = 'test';
let loadOptions = {profile, process: 'test'};

// Create and export helper object
var helper = module.exports = {};

// Load configuration
var cfg = base.config({profile});

// Configure PulseTestReceiver
helper.events = new base.testing.PulseTestReceiver(cfg.pulse, mocha);

// Allow tests to run expire-artifacts
helper.expireArtifacts = () => load('expire-artifacts', loadOptions)

// Allow tests to run expire-tasks
helper.expireTasks = () => load('expire-tasks', loadOptions)

// Allow tests to run expire-queues
helper.expireQueues = () => load('expire-queues', loadOptions)

// Process to terminate
var toTerminate = [];

// Allow tests to start claim-reaper
helper.claimReaper = async () => {
  var reaper = await load('claim-reaper', loadOptions);
  toTerminate.push(reaper);
  return reaper;
};
// Allow tests to start deadline-reaper
helper.deadlineReaper = async () => {
  var reaper = await load('deadline-reaper', loadOptions)
  toTerminate.push(reaper);
  return reaper;
};

// Hold reference to authServer
var authServer = null;
var webServer = null;

// Setup before tests
mocha.before(async () => {
  // Create mock authentication server
  authServer = await base.testing.createMockAuthServer({
    port:     60407, // This is hardcoded into config/test.js
    clients:  defaultClients
  });

  webServer = await load('server', loadOptions);

  // Create client for working with API
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
  await authServer.terminate();
});
