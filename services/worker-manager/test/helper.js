const libUrls = require('taskcluster-lib-urls');
const taskcluster = require('taskcluster-client');
const {stickyLoader, Secrets, withEntity, fakeauth} = require('taskcluster-lib-testing');
const builder = require('../src/api');
const data = require('../src/data');
const load = require('../src/main');

exports.rootUrl = 'http://localhost:60409';

exports.load = stickyLoader(load);
exports.load.inject('profile', 'test');
exports.load.inject('process', 'test');

// flush the mock log messages for each test case
setup(async function() {
  exports.monitor = await exports.load('monitor');
  exports.monitor.reset();
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-worker-manager',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl', mock: libUrls.testRootUrl()},
    ],
  },
  load: exports.load,
});

exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'WorkerType', data.WorkerType);
};

exports.withProvisioner = (mock, skipping) => {
  let provisioner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    provisioner = await exports.load('provisioner');
  });

  suiteTeardown(async function() {
    if (provisioner) {
      await provisioner.terminate();
      provisioner = null;
    }
  });
};

/**
 * Set up a fake tc-queue object that supports only the `pendingTasks` method,
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

    exports.queue = stubbedQueue();
    exports.load.inject('queue', exports.queue);
  });
};

exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await exports.load('cfg');

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    fakeauth.start({
      'test-client': ['*'],
    }, {rootUrl: exports.rootUrl});

    // Create client for working with API
    exports.WorkerManager = taskcluster.createClient(builder.reference());

    exports.workerManager = new exports.WorkerManager({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent: require('http').globalAgent,
      rootUrl: exports.rootUrl,
      credentials: {
        clientId: 'test-client',
        accessToken: 'none',
      },
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
  });
};

/**
 * make a queue object with the `pendingTasks` method stubbed out, and with
 * an `setPending` method to add fake tasks.
 */
const stubbedQueue = () => {
  const provisioners = {};
  const queue = new taskcluster.Queue({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      pendingTasks: async (provisionerId, workerType) => ({
        pendingTasks: provisioners[provisionerId][workerType],
        provisionerId,
        workerType,
      }),
    },
  });

  queue.setPending = function(provisionerId, workerType, pending) {
    provisioners[provisionerId] = provisioners[provisionerId] || {};
    provisioners[provisionerId][workerType] = pending;
  };

  return queue;
};
