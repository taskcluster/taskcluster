import taskcluster from 'taskcluster-client';
import { FakeEC2, FakeAzure, FakeGoogle } from './fakes/index.js';
import { Worker } from '../src/data.js';
import { globalAgent } from 'http';

import testing from 'taskcluster-lib-testing';

import builder from '../src/api.js';
import loadMain from '../src/main.js';

export const rootUrl = 'http://localhost:60409';
export const load = testing.stickyLoader(loadMain);

const helper = { load, rootUrl };
export default helper;

helper.load.inject('profile', 'test');
helper.load.inject('process', 'test');

testing.withMonitor(helper);

// set up the testing secrets
helper.secrets = new testing.Secrets({
  secrets: {},
  load: helper.load,
});

helper.withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'worker_manager');
};

helper.withPulse = (mock, skipping) => {
  testing.withPulse({ helper, skipping, namespace: 'taskcluster-worker-manager' });
};

helper.withProviders = (mock, skipping) => {
  const fakeEC2 = new FakeEC2();
  fakeEC2.forSuite();

  const fakeAzure = new FakeAzure();
  fakeAzure.forSuite();

  const fakeGoogle = new FakeGoogle;
  fakeGoogle.forSuite();
};

helper.withProvisioner = (mock, skipping) => {
  let provisioner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    helper.initiateProvisioner = async () => {
      provisioner = await load('provisioner');

      // remove it right away, so it will be re-created next time
      helper.load.remove('provisioner');

      await provisioner.initiate();
      return provisioner;
    };

    helper.terminateProvisioner = async () => {
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

helper.withWorkerScanner = (mock, skipping) => {
  let scanner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    helper.initiateWorkerScanner = async () => {
      scanner = await load('workerScanner');
      // remove it right away, as it is started on load
      helper.load.remove('workerScanner');
      return scanner;
    };

    helper.terminateWorkerScanner = async () => {
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
helper.withFakeQueue = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    helper.queue = stubbedQueue();
    helper.load.inject('queue', helper.queue);
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
helper.withFakeNotify = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    helper.notify = stubbedNotify();
    helper.load.inject('notify', helper.notify);

    setup(async function() {
      helper.notify.emails.splice(0);
    });
  });
};

helper.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await load('cfg');

    helper.load.cfg('taskcluster.rootUrl', helper.rootUrl);

    testing.fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: helper.rootUrl });

    // Create client for working with API
    helper.WorkerManager = taskcluster.createClient(builder.reference());

    helper.workerManager = new helper.WorkerManager({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent: globalAgent,
      rootUrl: helper.rootUrl,
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
  const pendingCounts = {};
  const claimedCounts = {};
  const queue = new taskcluster.Queue({
    rootUrl: helper.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      taskQueueCounts: async (taskQueueId) => {
        const [provisionerId, workerType] = taskQueueId.split('/');
        return {
          pendingTasks: pendingCounts[taskQueueId] ?? 0,
          claimedTasks: claimedCounts[taskQueueId] ?? 0,
          taskQueueId,
          provisionerId,
          workerType,
        };
      },
    },
  });

  queue.setPending = function(taskQueueId, pending) {
    pendingCounts[taskQueueId] = pending;
  };

  queue.setClaimed = function(taskQueueId, claimed) {
    claimedCounts[taskQueueId] = claimed;
  };

  return queue;
};

/**
 * make a notify object with the `email` method stubbed out
 */
const stubbedNotify = () => {
  const emails = [];
  const notify = new taskcluster.Notify({
    rootUrl: helper.rootUrl,
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
helper.getWorkers = async () =>
  Promise.all((await helper.db.fns.get_worker_manager_workers2(null, null, null, null, null, null, null)).map(
    async r => {
      const w = Worker.fromDb(r);
      return await Worker.get(helper.db, {
        workerPoolId: w.workerPoolId,
        workerGroup: w.workerGroup,
        workerId: w.workerId,
      });
    }));

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'workers',
      'worker_pools',
      'worker_pool_errors',
      'worker_pool_launch_configs',
    ] });
  });
};
