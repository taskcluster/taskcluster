const debug = require('debug');
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

  WorkerType: {
    requires: ['cfg', 'monitor', 'WorkerTypeError'],
    setup: ({cfg, monitor, WorkerTypeError}) => data.WorkerType.setup({
      tableName: cfg.app.workerTypeTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.workerTypeTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.workerTypes'),
    }),
  },

  WorkerTypeError: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.WorkerTypeError.setup({
      tableName: cfg.app.workerTypeErrorTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.workerTypeErrorTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      monitor: monitor.childMonitor('table.workerTypeErrors'),
    }),
  },

  expireWorkers: {
    requires: ['cfg', 'Worker', 'monitor'],
    setup: ({cfg, Worker, monitor}) => {
      return monitor.childMonitor('expireWorkers').oneShot('expire workers', async () => {
        debug('Expiring workers');
        const count = await Worker.expire();
        debug(`Expired ${count} rows`);
      });
    },
  },

  expireErrors: {
    requires: ['cfg', 'WorkerTypeError', 'monitor'],
    setup: ({cfg, WorkerTypeError, monitor}) => {
      return monitor.childMonitor('expireErrors').oneShot('expire workerTypeErrors', async () => {
        const threshold = taskcluster.fromNow(cfg.app.errorsExpirationDelay);
        debug('Expiring workerTypeErrors');
        const count = await WorkerTypeError.expire(threshold);
        debug(`Expired ${count} rows`);
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
    requires: ['cfg', 'schemaset', 'monitor', 'WorkerType', 'providers', 'publisher'],
    setup: async ({cfg, schemaset, monitor, WorkerType, providers, publisher}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        WorkerType,
        providers,
        publisher,
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

  providers: {
    requires: ['cfg', 'monitor', 'notify', 'estimator', 'Worker', 'WorkerType', 'schemaset'],
    setup: async ({cfg, monitor, notify, estimator, Worker, WorkerType, schemaset}) =>
      new Providers().setup({
        cfg, monitor, notify, estimator, Worker, WorkerType,
        validator: await schemaset.validator(cfg.taskcluster.rootUrl),
      }),
  },

  provisioner: {
    requires: ['cfg', 'monitor', 'WorkerType', 'providers', 'notify', 'pulseClient', 'reference'],
    setup: async ({cfg, monitor, WorkerType, providers, notify, pulseClient, reference}) => {
      const provisioner = new Provisioner({
        monitor: monitor.childMonitor('provisioner'),
        WorkerType,
        providers,
        notify,
        pulseClient,
        reference,
        rootUrl: cfg.taskcluster.rootUrl,
      });
      await provisioner.initiate();
      return provisioner;
    },
  },

  workerScanner: {
    requires: ['cfg', 'monitor', 'Worker', 'WorkerType', 'providers'],
    setup: async ({cfg, monitor, Worker, WorkerType, providers}) => {
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
