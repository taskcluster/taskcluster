const _ = require('lodash');
const assert = require('assert');
const taskcluster = require('taskcluster-client');
const mocha = require('mocha');
const {fakeauth, stickyLoader, Secrets} = require('taskcluster-lib-testing');
const load = require('../src/main');
const config = require('typed-env-config');
const data = require('../src/data');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-secrets',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl'},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
  },
  load: exports.load,
});

/**
 * Set helper.Secret to a fully-configured Secret entity, and inject it into the loader
 */
exports.withSecret = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      const cfg = await exports.load('cfg');
      exports.load.inject('Secret', data.Secret.setup({
        tableName: 'Secret',
        credentials: 'inMemory',
        cryptoKey: cfg.azure.cryptoKey,
        signingKey: cfg.azure.signingKey,
      }));
    }

    exports.Secret = await exports.load('Secret');
    await exports.Secret.ensureTable();
  });

  const cleanup = async () => {
    if (!skipping()) {
      await exports.Secret.scan({}, {handler: secret => secret.remove()});
    }
  };
  setup(cleanup);
  suiteTeardown(cleanup);
};

// Some clients for the tests, with differents scopes.  These are turned
// into temporary credentials based on the main test credentials, so
// the clientIds listed here are purely internal to the tests.
var testClients = {
  'captain-write': ['secrets:set:captain:*'],
  'captain-read': ['secrets:get:captain:*'],
  'captain-read-write': ['secrets:set:captain:*', 'secrets:get:captain:*'],
  'captain-read-limited': ['secrets:get:captain:limited/*'],
};

/**
 * Set up an API server.  Call this after withSecret, so the server
 * uses the same Secret class.
 *
 * This also sets up helper.client as an API client generator, using the
 * "captain" clients.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    const cfg = await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    const rootUrl = 'http://localhost:60415';
    exports.load.cfg('taskcluster.rootUrl', rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testClients, {rootUrl});

    const api = await exports.load('api');
    exports.client = async clientId => {
      const SecretsClient = taskcluster.createClient(api.reference());

      return new SecretsClient({
        credentials: {clientId, accessToken: 'unused'},
        rootUrl,
      });
    };

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};
