const assert = require('assert');
const data = require('../src/data');
const builder = require('../src/api');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const {fakeauth, stickyLoader, Secrets, withEntity, withPulse, withMonitor, withDb, resetTables} = require('taskcluster-lib-testing');

const helper = module.exports;

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: {
    db: withDb.secret,
  },
  load: exports.load,
});

helper.rootUrl = 'http://localhost:60020';

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'IndexedTask', data.IndexedTask);
  withEntity(mock, skipping, exports, 'Namespace', data.Namespace);
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'index');
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-index'});
};

/**
 * Set up a fake tc-queue object that supports only the `task` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.queue`.
 */
exports.withFakeQueue = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    helper.queue = stubbedQueue();
    helper.load.inject('queue', helper.queue);
  });
};

/**
 * Set up an API server.  Call this after withEntities, so the server
 * uses the same Entities classes.
 *
 * This also sets up helper.scopes to set the scopes for helper.queue, the
 * API client object, and stores a client class a helper.Index.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', helper.rootUrl);
    fakeauth.start({'test-client': ['*']}, {rootUrl: helper.rootUrl});

    helper.Index = taskcluster.createClient(builder.reference());

    helper.scopes = (...scopes) => {
      const options = {
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent: require('http').globalAgent,
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

    webServer = await helper.load('server');
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
    fakeauth.stop();
  });
};

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

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      exports.db['fakeindex'].reset();
    } else {
      const sec = exports.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: [
        'indexed_tasks_entities',
        'namespaces_entities',
      ]});
    }
  });
};
