const loader = require('taskcluster-lib-loader');
const taskcluster = require('taskcluster-client');
const App = require('taskcluster-lib-app');
const monitorManager = require('./monitor');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const libReferences = require('taskcluster-lib-references');
const exchanges = require('./exchanges');
const data = require('./data');
const builder = require('./api');
const {Estimator} = require('./estimator');
const {sasCredentials} = require('taskcluster-lib-azure');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');
const {Provisioner} = require('./provisioner');
const {WorkerScanner} = require('./worker-scanner');
const {Providers} = require('./providers');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitorManager.setup({
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  Worker: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.Worker.setup({
      tableName: cfg.app.workerTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.workerTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.workers'),
    }),
  },

  WorkerPool: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.WorkerPool.setup({
      tableName: cfg.app.workerPoolTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.workerPoolTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.workerPools'),
    }),
  },

  WorkerPoolError: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.WorkerPoolError.setup({
      tableName: cfg.app.workerPoolErrorTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.workerPoolErrorTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.workerPoolErrors'),
    }),
  },

  expireWorkerPools: {
    requires: ['cfg', 'WorkerPool', 'monitor'],
    setup: ({cfg, WorkerPool, monitor}) => {
      return monitor.childMonitor('expireWorkerPools').oneShot('expire worker pools', async () => {
        await WorkerPool.expire(monitor);
      });
    },
  },

  expireWorkers: {
    requires: ['cfg', 'Worker', 'monitor'],
    setup: ({cfg, Worker, monitor}) => {
      return monitor.childMonitor('expireWorkers').oneShot('expire workers', async () => {
        await Worker.expire(monitor);
      });
    },
  },

  expireErrors: {
    requires: ['cfg', 'WorkerPoolError', 'monitor'],
    setup: ({cfg, WorkerPoolError, monitor}) => {
      return monitor.childMonitor('expireErrors').oneShot('expire workerPoolErrors', async () => {
        const threshold = taskcluster.fromNow(cfg.app.errorsExpirationDelay);
        await WorkerPoolError.expire(threshold);
      });
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'worker-manager',
    }),
  },

  reference: {
    requires: [],
    setup: () => exchanges.reference(),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), monitorManager.reference()],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: 'taskcluster-worker-manager',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({cfg, pulseClient, schemaset}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      client: pulseClient,
      publish: false,
    }),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'Worker', 'WorkerPool', 'WorkerPoolError', 'providers', 'publisher', 'notify'],
    setup: async ({
      cfg,
      schemaset,
      monitor,
      Worker,
      WorkerPool,
      WorkerPoolError,
      providers,
      publisher,
      notify,
    }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        Worker,
        WorkerPool,
        WorkerPoolError,
        providers,
        publisher,
        notify,
      },
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      apis: [api],
      ...cfg.server,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue(cfg.taskcluster),
  },

  notify: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Notify(cfg.taskcluster),
  },

  estimator: {
    requires: ['cfg', 'queue', 'monitor'],
    setup: ({cfg, queue, monitor}) => new Estimator({
      queue,
      monitor: monitor.childMonitor('estimator'),
    }),
  },

  // This is used in testing to inject provider fakes
  fakeCloudApis: {
    requires: [],
    setup: () => {},
  },

  providers: {
    requires: ['cfg', 'monitor', 'notify', 'estimator', 'Worker', 'WorkerPool', 'WorkerPoolError', 'schemaset', 'fakeCloudApis'],
    setup: async ({cfg, monitor, notify, estimator, Worker, WorkerPool, WorkerPoolError, schemaset, fakeCloudApis}) =>
      new Providers().setup({
        cfg, monitor, notify, estimator, Worker, WorkerPool, WorkerPoolError, fakeCloudApis,
        validator: await schemaset.validator(cfg.taskcluster.rootUrl),
      }),
  },

  provisioner: {
    requires: ['cfg', 'monitor', 'WorkerPool', 'providers', 'notify', 'pulseClient', 'reference'],
    setup: async ({cfg, monitor, WorkerPool, providers, notify, pulseClient, reference}) => {
      return new Provisioner({
        monitor: monitor.childMonitor('provisioner'),
        WorkerPool,
        providers,
        notify,
        pulseClient,
        reference,
        rootUrl: cfg.taskcluster.rootUrl,
      });
    },
  },

  runProvisioner: {
    requires: ['provisioner'],
    setup: async ({provisioner}) => await provisioner.initiate(),
  },

  workerScanner: {
    requires: ['cfg', 'monitor', 'Worker', 'WorkerPool', 'providers'],
    setup: async ({cfg, monitor, Worker, WorkerPool, providers}) => {
      const workerScanner = new WorkerScanner({
        Worker,
        providers,
        monitor: monitor.childMonitor('worker-scanner'),
      });
      await workerScanner.initiate();
      return workerScanner;
    },
  },

}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}

module.exports = load;
