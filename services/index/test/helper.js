import assert from 'assert';
import builder from '../src/api.js';
import taskcluster from '@taskcluster/client';
import loadMain from '../src/main.js';
import { globalAgent } from 'http';
import { satisfiesExpression } from 'taskcluster-lib-scopes';

import testing from '@taskcluster/lib-testing';

export const load = testing.stickyLoader(loadMain);

const helper = { load };
export default helper;

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper);

// set up the testing secrets
export const secrets = new testing.Secrets({
  secrets: {
  },
  load: load,
});
helper.secrets = secrets;

helper.rootUrl = 'http://localhost:60020';

export const withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'index');
};
helper.withDb = withDb;

export const withPulse = (mock, skipping) => {
  testing.withPulse({ helper, skipping, namespace: 'taskcluster-index' });
};
helper.withPulse = withPulse;

/**
 * Set up a fake tc-queue object that supports only the `task` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.queue`.
 */
export const withFakeQueue = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    helper.queue = stubbedQueue();
    load.inject('queue', helper.queue);
  });
};
helper.withFakeQueue = withFakeQueue;

let anonymousScopes = [];

helper.setAnonymousScopes = (scopes) => {
  anonymousScopes = scopes;
};

export const withFakeAnonymousScopeCache = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    load.inject('isPublicArtifact', (artifactName) => {
      return satisfiesExpression(anonymousScopes, `queue:get-artifact:${artifactName}`);
    });
  });

  setup(function() {
    if (skipping()) {
      return;
    }
    anonymousScopes = [];
  });
};
helper.withFakeAnonymousScopeCache = withFakeAnonymousScopeCache;

/**
 * Set up an API server.  Call this after withDb, so the server
 * uses the same Entities classes.
 *
 * This also sets up helper.scopes to set the scopes for helper.queue, the
 * API client object, and stores a client class a helper.Index.
 */
export const withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.rootUrl', helper.rootUrl);
    testing.fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: helper.rootUrl });

    helper.Index = taskcluster.createClient(builder.reference());

    helper.scopes = (...scopes) => {
      const options = {
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent: globalAgent,
        rootUrl: helper.rootUrl,
        retries: 0,
      };
      // if called as scopes('none'), don't pass credentials at all
      if (scopes && scopes[0] !== 'none') {
        options['credentials'] = {
          clientId: 'test-client',
          accessToken: 'none',
        };
        options['authorizedScopes'] = scopes.length > 0 ? scopes : undefined;
      }
      helper.index = new helper.Index(options);
    };

    webServer = await load('server');
  });

  setup(async function() {
    if (skipping()) {
      return;
    }
    // reset scopes to *
    helper.scopes();
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    testing.fakeauth.stop();
  });
};
helper.withServer = withServer;

/**
 * make a queue object with the `task` method stubbed out, and with
 * an `addTask` method to add fake tasks.
 */
const stubbedQueue = () => {
  const tasks = {};
  const queue = new taskcluster.Queue({
    rootUrl: helper.rootUrl,
    credentials: {
      clientId: 'index-server',
      accessToken: 'none',
    },
    fake: {
      task: async (taskId) => {
        const task = tasks[taskId];
        assert(task, `fake queue has no task ${taskId}`);
        return task;
      },
    },
  });

  queue.addTask = function(taskId, task) {
    tasks[taskId] = task;
  };

  return queue;
};

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'indexed_tasks',
      'index_namespaces',
    ] });
  });
};
helper.resetTables = resetTables;
