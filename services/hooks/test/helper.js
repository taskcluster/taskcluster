const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const taskcreator = require('../src/taskcreator');
const {stickyLoader, fakeauth, Secrets} = require('taskcluster-lib-testing');
const builder = require('../src/v1');
const load = require('../src/main');
const config = require('typed-env-config');
const _ = require('lodash');

const helper = module.exports = {};

helper.rootUrl = 'http://localhost:60401';

helper.load = stickyLoader(load);
helper.load.inject('profile', 'test');
helper.load.inject('process', 'test');

helper.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-hooks',
  load: helper.load,
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl'},
    ],
  },
});

/**
 * Set helper.Hook to a set-up Hook entity (and inject it into the loader)
 */
helper.withHook = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      const cfg = await helper.load('cfg');
      helper.load.inject('Hook', data.Hook.setup({
        tableName: cfg.app.hookTableName,
        credentials: 'inMemory',
        cryptoKey: cfg.azure.cryptoKey,
        signingKey: cfg.azure.signingKey,
      }));
    }

    helper.Hook = await helper.load('Hook');
    await helper.Hook.ensureTable();
  });

  const cleanup = async () => {
    if (!skipping()) {
      await helper.Hook.scan({}, {handler: hook => hook.remove()});
    }
  };
  setup(cleanup);
  suiteTeardown(cleanup);
};

/**
 * Set up a MockTaskCreator; with this, use helper.creator.fireCalls
 * to see what calls to taskcreator.fire() have been made, and set
 * helper.creator.shouldFail to make the TaskCreator fail.
 * Call this before withServer.
 */
helper.withTaskCreator = function(mock, skipping) {
  suiteSetup(async () => {
    if (skipping()) {
      return;
    }

    const cfg = await helper.load('cfg');

    helper.creator = new taskcreator.MockTaskCreator();
    helper.load.inject('taskcreator', helper.creator);
  });

  setup(function() {
    helper.creator.fireCalls = [];
    helper.creator.shouldFail = false;
  });
};

/**
 * Set up an API server.  Call this after withHook, so the server
 * uses the same Hook class.
 *
 * This also sets up helper.hooks as an API client, using scopes configurable
 * with helper.scopes([..]); and configures fakeAuth to support that.
 */
helper.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await helper.load('cfg');

    helper.load.cfg('taskcluster.rootUrl', helper.rootUrl);
    fakeauth.start({
      'test-client': ['*'],
    }, {rootUrl: helper.rootUrl});

    // Create client for working with API
    helper.Hooks = taskcluster.createClient(builder.reference());

    // Utility to create an Hooks instance with limited scopes
    helper.scopes = (...scopes) => {
      helper.hooks = new helper.Hooks({
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent: require('http').globalAgent,
        rootUrl: helper.rootUrl,
        credentials: {
          clientId: 'test-client',
          accessToken: 'none',
        },
        //authBaseUrl: cfg.get('taskcluster:authBaseUrl'),
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };

    webServer = await helper.load('server');
  });

  setup(function() {
    helper.scopes();
  });

  suiteTeardown(async function() {
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
  });
};
