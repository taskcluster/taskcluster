const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const taskcreator = require('../src/taskcreator');
const {stickyLoader, fakeauth, Secrets} = require('taskcluster-lib-testing');
const v1 = require('../src/v1');
const load = require('../src/main');
const config = require('typed-env-config');
const _ = require('lodash');

const helper = module.exports = {};

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
    ],
  },
});

/**
 * Set helper.Hook to a set-up Hook entity (and inject it into the loader)
 */
helper.withHook = (mock, skipping) => {
  suiteSetup(async function() {
    if (mock) {
      // TODO: rename this config to be consistent
      helper.load.cfg('azure.accountName', 'inMemory');
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
    const cfg = await helper.load('cfg');

    fakeauth.start({
      'test-client': ['*'],
    });

    // Create client for working with API
    helper.baseUrl = cfg.server.publicUrl + '/v1';
    const reference = v1.reference({baseUrl: helper.baseUrl});
    helper.Hooks = taskcluster.createClient(reference);

    // Utility to create an Hooks instance with limited scopes
    helper.scopes = (...scopes) => {
      helper.hooks = new helper.Hooks({
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent:            require('http').globalAgent,
        baseUrl:          helper.baseUrl,
        credentials: {
          clientId:       'test-client',
          accessToken:    'none',
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
