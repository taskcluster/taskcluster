import taskcluster from 'taskcluster-client';
import { FakeEC2, FakeAzure, FakeGoogle } from './fakes';
import { Worker } from '../src/data';

import {
  stickyLoader,
  Secrets,
  fakeauth,
  withMonitor,
  withPulse,
  withDb,
  resetTables,
} from 'taskcluster-lib-testing';

import builder from '../src/api';
import load from '../src/main';

export const rootUrl = 'http://localhost:60409';
export const load = stickyLoader(load);
exports.load.inject('profile', 'test');
exports.load.inject('process', 'test');

withMonitor(exports);

// set up the testing secrets
export const secrets = new Secrets({
  secrets: {},
  load: exports.load,
});

export const withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'worker_manager');
};

export const withPulse = (mock, skipping) => {
  withPulse({ helper: exports, skipping, namespace: 'taskcluster-worker-manager' });
};

export const withProviders = (mock, skipping) => {
  const fakeEC2 = new FakeEC2();
  fakeEC2.forSuite();

  const fakeAzure = new FakeAzure();
  fakeAzure.forSuite();

  const fakeGoogle = new FakeGoogle;
  fakeGoogle.forSuite();
};

export const withProvisioner = (mock, skipping) => {
  let provisioner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    export const initiateProvisioner = async () => {
      provisioner = await load('provisioner');

      // remove it right away, so it will be re-created next time
      exports.load.remove('provisioner');

      await provisioner.initiate();
      return provisioner;
    };

    export const terminateProvisioner = async () => {
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

export const withWorkerScanner = (mock, skipping) => {
  let scanner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    export const initiateWorkerScanner = async () => {
      scanner = await load('workerScanner');
      // remove it right away, as it is started on load
      exports.load.remove('workerScanner');
      return scanner;
    };

    export const terminateWorkerScanner = async () => {
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
export const withFakeQueue = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    export const queue = stubbedQueue();
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
export const withFakeNotify = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    export const notify = stubbedNotify();
    exports.load.inject('notify', exports.notify);

    setup(async function() {
      exports.notify.emails.splice(0);
    });
  });
};

export const withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await load('cfg');

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);

    fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: exports.rootUrl });

    // Create client for working with API
    export const WorkerManager = taskcluster.createClient(builder.reference());

    export const workerManager = new exports.WorkerManager({
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

    webServer = await load('server');
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
    },
  });

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
export const getWorkers = async () =>
  Promise.all((await exports.db.fns.get_workers_without_provider_data(null, null, null, null, null, null)).map(
    async r => {
      const w = Worker.fromDb(r);
      return await Worker.get(exports.db, {
        workerPoolId: w.workerPoolId,
        workerGroup: w.workerGroup,
        workerId: w.workerId,
      });
    }));

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'workers',
      'worker_pools',
      'worker_pool_errors',
    ] });
  });
};
