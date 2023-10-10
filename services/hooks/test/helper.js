import { globalAgent } from 'http';
import taskcluster from 'taskcluster-client';
import taskcreator from '../src/taskcreator.js';

import testing from 'taskcluster-lib-testing';

import builder from '../src/api.js';
import loadMain from '../src/main.js';

const load = testing.stickyLoader(loadMain);

const helper = { load };

helper.rootUrl = 'http://localhost:60401';

load.inject('profile', 'test');
load.inject('process', 'test');

testing.withMonitor(helper);

helper.secrets = new testing.Secrets({
  load: helper.load,
  secrets: {
  },
});

helper.withDb = (mock, skipping) => {
  const dbHelper = { load };
  testing.withDb(mock, skipping, dbHelper, 'hooks');
  return dbHelper;
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

helper.withPulse = (mock, skipping) => {
  const pulseHelper = { load };
  testing.withPulse({ helper: pulseHelper, skipping, namespace: 'taskcluster-hooks' });
  return pulseHelper;
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
    testing.fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: helper.rootUrl });

    // Create client for working with API
    helper.Hooks = taskcluster.createClient(builder.reference());

    // Utility to create an Hooks instance with limited scopes
    helper.scopes = (...scopes) => {
      helper.hooks = new helper.Hooks({
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent: globalAgent,
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

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'hooks',
      'hooks_queues',
      'hooks_last_fires',
    ] });
  });
};

export default helper;
