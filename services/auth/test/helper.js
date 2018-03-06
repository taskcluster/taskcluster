var assert      = require('assert');
var Promise     = require('promise');
var path        = require('path');
var _           = require('lodash');
var testing     = require('taskcluster-lib-testing');
var data        = require('../src/data');
var v1          = require('../src/v1');
var taskcluster = require('taskcluster-client');
var mocha       = require('mocha');
var serverLoad  = require('../src/main');
var exchanges   = require('../src/exchanges');
var testserver  = require('./testserver');
var slugid      = require('slugid');
var Config      = require('typed-env-config');
var azure       = require('fast-azure-storage');
var containers  = require('../src/containers');
var uuid        = require('uuid');

// Load configuration
var cfg = Config({profile: 'test'});

// Create subject to be tested by test
var helper = module.exports = {};

// Use a unique container name per run, so that parallel test runs
// do not interfere with each other.
helper.containerName = `auth-test-${uuid.v4()}`;

helper.cfg = cfg;
helper.testaccount = _.keys(cfg.app.azureAccounts)[0];
helper.rootAccessToken = cfg.app.rootAccessToken;

helper.hasPulseCredentials = function() {
  return cfg.pulse.hasOwnProperty('password') && cfg.pulse.password;
};

helper.hasAzureCredentials = function() {
  return cfg.app.hasOwnProperty('azureAccounts') && cfg.app.azureAccounts;
};

// Configure PulseTestReceiver
if (cfg.pulse.password) {
  helper.events = new testing.PulseTestReceiver(cfg.pulse, mocha);
};

// fake "Roles" container
class FakeRoles {
  constructor() {
    this.roles = [];
  }

  async get() {
    return this.roles;
  }

  async modify(modifier) {
    await modifier(this.roles);
  }
}

var webServer = null, testServer;
mocha.before(async () => {
  let overwrites = {};
  overwrites['profile'] = 'test';
  overwrites['process'] = 'test';
  helper.overwrites = overwrites;
  helper.load = serverLoad;

  // if we don't have an azure account/key, use the inmemory version
  if (!cfg.azure || !cfg.azure.accountName) {
    let signingKey = cfg.app.tableSigningKey;
    let cryptoKey = cfg.app.tableCryptoKey;
    helper.Client = overwrites['Client'] = data.Client.setup({
      table: 'Client',
      account: 'inMemory',
      credentials: null,
      cryptoKey,
      signingKey,
    });
    helper.Roles = overwrites['Roles'] = new FakeRoles();
  } else {
    helper.Client = overwrites['Client'] = await serverLoad('Client', overwrites);
    helper.Roles = overwrites['Roles'] = new containers.Roles({
      containerName: helper.containerName,
      credentials: cfg.azure,
    });
    await helper.Roles.setup();
  }

  if (!helper.hasPulseCredentials()) {
    return;
  } else {
    overwrites.resolver = helper.resolver =
      await serverLoad('resolver', overwrites);

    webServer = await serverLoad('server', overwrites);
    webServer.setTimeout(3500); // >3s because Azure can be sloooow

    // Create client for working with API
    helper.baseUrl = 'http://localhost:' + webServer.address().port + '/v1';
    var reference = v1.reference({baseUrl: helper.baseUrl});
    helper.Auth = taskcluster.createClient(reference);
    helper.scopes = (...scopes) => {
      helper.auth = new helper.Auth({
        baseUrl:          helper.baseUrl,
        credentials: {
          clientId:       'root',
          accessToken:    cfg.app.rootAccessToken,
        },
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };
    helper.scopes();

    // Create test server
    let {
      server:     testServer_,
      reference:  testReference,
      baseUrl:    testBaseUrl,
      Client:     TestClient,
      client:     testClient,
    } = await testserver({
      authBaseUrl: helper.baseUrl,
      rootAccessToken: cfg.app.rootAccessToken,
    });

    testServer = testServer_;
    helper.testReference  = testReference;
    helper.testBaseUrl    = testBaseUrl;
    helper.TestClient     = TestClient;
    helper.testClient     = testClient;

    var exchangeReference = exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    });
    helper.AuthEvents = taskcluster.createClient(exchangeReference);
    helper.authEvents = new helper.AuthEvents();
  }
});

mocha.beforeEach(() => {
  // Setup client with all scopes
  if (helper.hasPulseCredentials()) {
    helper.scopes();
  }
});

// Cleanup after tests
mocha.after(async () => {
  if (cfg.azure && cfg.azure.accountName && cfg.azure.accountKey) {
    const blobService = new azure.Blob({
      accountId: cfg.azure.accountName,
      accountKey: cfg.azure.accountKey,
    });
    try {
      await blobService.deleteContainer(helper.containerName);
    } catch (e) {
      if (e.code !== 'ResourceNotFound') {
        throw e;
      }
      // already deleted, so nothing to do
      // NOTE: really, this doesn't work -- the container doesn't register as existing
      // before the tests are complete, so we "leak" containers despite this effort to
      // clean them up.
    }
  }
  if (!helper.hasPulseCredentials()) {
    return;
  }
  // Kill servers
  if (testServer) {
    await testServer.terminate();
  }
  if (webServer) {
    await webServer.terminate();
  }

});
