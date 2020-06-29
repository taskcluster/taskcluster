const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const taskcreator = require('../src/taskcreator');
const {stickyLoader, fakeauth, Secrets, withEntity, withPulse, withMonitor, withDb, resetTables} = require('taskcluster-lib-testing');
const builder = require('../src/api');
const load = require('../src/main');

const helper = exports;

helper.rootUrl = 'http://localhost:60401';

helper.load = stickyLoader(load);
helper.load.inject('profile', 'test');
helper.load.inject('process', 'test');

withMonitor(helper);

helper.secrets = new Secrets({
  load: helper.load,
  secrets: {
    db: withDb.secret,
  },
});

helper.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'Hook', data.Hook);
  withEntity(mock, skipping, exports, 'LastFire', data.LastFire);
  withEntity(mock, skipping, exports, 'Queues', data.Queues);
};

helper.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'hooks');
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

    await helper.load('cfg');

    helper.creator = new taskcreator.MockTaskCreator();
    helper.load.inject('taskcreator', helper.creator);
  });

  setup(function() {
    helper.creator.fireCalls = [];
    helper.creator.shouldFail = false;
    helper.creator.shouldNotProduceTask = false;
  });
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-hooks'});
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

    await helper.load('cfg');

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
        retries: 0,
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

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      helper.db.hooks.reset();
    } else {
      const sec = helper.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: [
        'hooks_entities',
        'queues_entities',
        'last_fire_3_entities',
      ]});
    }
  });
};
