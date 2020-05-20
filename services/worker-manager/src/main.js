require('../../prelude');
const loader = require('taskcluster-lib-loader');
const taskcluster = require('taskcluster-client');
const {App} = require('taskcluster-lib-app');
const {MonitorManager} = require('taskcluster-lib-monitor');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const libReferences = require('taskcluster-lib-references');
const exchanges = require('./exchanges');
const data = require('./data');
const builder = require('./api');
const {Estimator} = require('./estimator');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');
const tcdb = require('taskcluster-db');
const {Provisioner} = require('./provisioner');
const {Providers} = require('./providers');
const {WorkerScanner} = require('./worker-scanner');
const {WorkerPool} = require('./data');

require('./monitor');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({
      profile,
      serviceName: 'worker-manager',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'worker-manager',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({cfg, process, monitor}) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'worker_manager',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  Worker: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}) => data.Worker.setup({
      db,
      serviceName: 'worker_manager',
      tableName: cfg.app.workerTableName,
      monitor: monitor.childMonitor('table.workers'),
    }),
  },

  WorkerPoolError: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}) => data.WorkerPoolError.setup({
      db,
      serviceName: 'worker_manager',
      tableName: cfg.app.workerPoolErrorTableName,
      monitor: monitor.childMonitor('table.workerPoolErrors'),
    }),
  },

  expireWorkerPools: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}, ownName) => {
      return monitor.childMonitor('expireWorkerPools').oneShot(ownName, async () => {
        const expired = await WorkerPool.expire({db, monitor});
        for (let workerPoolId of expired) {
          monitor.info(`deleted expired worker pool ${workerPoolId}`);
        }
      });
    },
  },

  expireWorkers: {
    requires: ['cfg', 'Worker', 'monitor'],
    setup: ({cfg, Worker, monitor}, ownName) => {
      return monitor.childMonitor('expireWorkers').oneShot(ownName, async () => {
        await Worker.expire(monitor);
      });
    },
  },

  expireErrors: {
    requires: ['cfg', 'WorkerPoolError', 'monitor'],
    setup: ({cfg, WorkerPoolError, monitor}, ownName) => {
      return monitor.childMonitor('expireErrors').oneShot(ownName, async () => {
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
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('worker-manager')],
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
    requires: [
      'cfg', 'db', 'schemaset', 'monitor', 'Worker', 'WorkerPoolError', 'providers',
      'publisher', 'notify'],
    setup: async ({
      cfg,
      db,
      schemaset,
      monitor,
      Worker,
      WorkerPoolError,
      providers,
      publisher,
      notify,
    }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        cfg,
        db,
        monitor,
        Worker,
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
    requires: ['cfg', 'monitor', 'notify', 'db', 'estimator', 'Worker', 'WorkerPoolError', 'schemaset', 'fakeCloudApis'],
    setup: async ({cfg, monitor, notify, db, estimator, Worker, WorkerPoolError, schemaset, fakeCloudApis}) =>
      new Providers().setup({
        cfg, monitor, notify, db, estimator, Worker, WorkerPoolError, fakeCloudApis,
        validator: await schemaset.validator(cfg.taskcluster.rootUrl),
      }),
  },

  workerScanner: {
    requires: ['cfg', 'monitor', 'Worker', 'providers'],
    setup: async ({cfg, monitor, Worker, providers}, ownName) => {
      const workerScanner = new WorkerScanner({
        ownName,
        Worker,
        providers,
        monitor: monitor.childMonitor('worker-scanner'),
        iterateConf: cfg.app.workerScannerIterateConfig || {},
      });
      await workerScanner.initiate();
      return workerScanner;
    },
  },

  provisioner: {
    requires: ['cfg', 'monitor', 'Worker', 'providers', 'notify', 'pulseClient', 'reference', 'db'],
    setup: async ({cfg, monitor, Worker, providers, notify, pulseClient, reference, db}, ownName) => {
      return new Provisioner({
        ownName,
        monitor: monitor.childMonitor('provisioner'),
        Worker,
        providers,
        notify,
        pulseClient,
        db,
        reference,
        rootUrl: cfg.taskcluster.rootUrl,
        iterateConf: cfg.app.provisionerIterateConfig || {},
      });
    },
  },

  runProvisioner: {
    requires: ['provisioner'],
    setup: async ({provisioner}) => await provisioner.initiate(),
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
