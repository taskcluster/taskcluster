const taskcluster = require('taskcluster-client');
const { FakeEC2, FakeAzure, FakeGoogle } = require('./fakes');
const { Worker } = require('../src/data');
const { stickyLoader, Secrets, fakeauth, withMonitor, withPulse, withDb, resetTables } = require('taskcluster-lib-testing');
const builder = require('../src/api');
const load = require('../src/main');

exports.rootUrl = 'http://localhost:60409';

exports.load = stickyLoader(load);
exports.load.inject('profile', 'test');
exports.load.inject('process', 'test');

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: {},
  load: exports.load,
});

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'worker_manager');
};

exports.withPulse = (mock, skipping) => {
  withPulse({ helper: exports, skipping, namespace: 'taskcluster-worker-manager' });
};

exports.withProviders = (mock, skipping) => {
  const fakeEC2 = new FakeEC2();
  fakeEC2.forSuite();

  const fakeAzure = new FakeAzure();
  fakeAzure.forSuite();

  const fakeGoogle = new FakeGoogle;
  fakeGoogle.forSuite();
};

exports.withProvisioner = (mock, skipping) => {
  let provisioner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.initiateProvisioner = async () => {
      provisioner = await exports.load('provisioner');

      // remove it right away, so it will be re-created next time
      exports.load.remove('provisioner');

      await provisioner.initiate();
      return provisioner;
    };
    exports.terminateProvisioner = async () => {
      if (provisioner) {
        await provisioner.terminate();
        provisioner = null;
      }
    };
  });

  teardown(function() {
    if (provisioner) {
      throw new Error('Must call terminateProvisioner if you have started it');
    }
  });
};

exports.withWorkerScanner = (mock, skipping) => {
  let scanner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.initiateWorkerScanner = async () => {
      scanner = await exports.load('workerScanner');
      // remove it right away, as it is started on load
      exports.load.remove('workerScanner');
      return scanner;
    };
    exports.terminateWorkerScanner = async () => {
      if (scanner) {
        await scanner.terminate();
        scanner = null;
      }
    };
  });

  teardown(function() {
    if (scanner) {
      throw new Error('Must call terminateWorkerScanner if you have started it');
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

/**
 * Set up a fake tc-notify object that supports only the `email` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.notify`.
 *
 * We consider any emailing to be test-failing at the moment
 */
exports.withFakeNotify = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    exports.notify = stubbedNotify();
    exports.load.inject('notify', exports.notify);

    setup(async function() {
      exports.notify.emails.splice(0);
    });
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
    }, { rootUrl: exports.rootUrl });

    // Create client for working with API
    exports.WorkerManager = taskcluster.createClient(builder.reference());

    exports.workerManager = new exports.WorkerManager({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent: require('http').globalAgent,
      rootUrl: exports.rootUrl,
      retries: 0,
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
  const taskQueues = {};
  const quarantines = [];
  const queue = new taskcluster.Queue({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      pendingTasks: async (taskQueueId) => {
        let pendingTasks = 0;
        if (taskQueues[taskQueueId]) {
          pendingTasks = taskQueues[taskQueueId];
        }
        const [provisionerId, workerType] = taskQueueId.split('/');
        return {
          pendingTasks,
          taskQueueId,
          provisionerId,
          workerType,
        };
      },
      quarantineWorker: async (provisionerId, workerType, workerGroup, workerId, payload) => {
        quarantines.push({ provisionerId, workerType, workerGroup, workerId, payload });
        return {
          provisionerId,
          workerType,
          workerGroup,
          workerId,
          payload,
        };
      },
    },
  });

  queue.quarantines = quarantines;
  queue.setPending = function(taskQueueId, pending) {
    taskQueues[taskQueueId] = pending;
  };

  return queue;
};

/**
 * make a notify object with the `email` method stubbed out
 */
const stubbedNotify = () => {
  const emails = [];
  const notify = new taskcluster.Notify({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      email: async ({ address, subject, content }) => {
        emails.push({ address, subject, content });
      },
    },
  });

  notify.emails = emails;

  return notify;
};

/**
 * Get all workers
 */
exports.getWorkers = async () =>
  Promise.all((await exports.db.fns.get_workers_without_provider_data(null, null, null, null, null, null)).map(
    async r => {
      const w = Worker.fromDb(r);
      return await Worker.get(exports.db, {
        workerPoolId: w.workerPoolId,
        workerGroup: w.workerGroup,
        workerId: w.workerId,
      });
    }));

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'workers',
      'worker_pools',
      'worker_pool_errors',
    ] });
  });
};
