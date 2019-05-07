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
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.WorkerType.setup({
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
      return monitor.childMonitor().oneShot('expire workers', async () => {
        const threshold = taskcluster.fromNow(cfg.app.workersExpirationDelay);
        debug('Expiring workers');
        const count = await Worker.expire(threshold);
        debug(`Expired ${count} rows`);
      });
    },
  },

  expireErrors: {
    requires: ['cfg', 'WorkerTypeError', 'monitor'],
    setup: ({cfg, WorkerTypeError, monitor}) => {
      return monitor.childMonitor().oneShot('expire workerTypeErrors', async () => {
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
      references: [builder.reference(), monitorManager.reference()],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: cfg.pulse.namespace,
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
      provisionerId: cfg.app.provisionerId,
      queue,
      monitor: monitor.childMonitor('estimator'),
    }),
  },

  providers: {
    requires: ['cfg', 'monitor', 'notify', 'estimator', 'Worker', 'schemaset'],
    setup: async ({cfg, monitor, notify, estimator, Worker, schemaset}) => {
      const _providers = {};
      const validator = await schemaset.validator(cfg.taskcluster.rootUrl);
      Object.entries(cfg.providers).forEach(([name, meta]) => {
        let Prov;
        switch(meta.implementation) {
          case 'testing': Prov = require('./provider_testing').TestingProvider; break;
          case 'static': Prov = require('./provider_static').StaticProvider; break;
          case 'google': Prov = require('./provider_google').GoogleProvider; break;
          default: throw new Error(`Unkown provider ${meta.implementation} selected for provider ${name}.`);
        }
        _providers[name] = new Prov({
          name,
          notify,
          monitor: monitor.childMonitor(name),
          provisionerId: cfg.app.provisionerId,
          rootUrl: cfg.taskcluster.rootUrl,
          taskclusterCredentials: cfg.taskcluster.credentials,
          estimator,
          Worker,
          validator,
          ...meta,
        });
      });
      return _providers;
    },
  },

  provisioner: {
    requires: ['cfg', 'monitor', 'WorkerType', 'providers', 'notify', 'pulseClient', 'reference'],
    setup: async ({cfg, monitor, WorkerType, providers, notify, pulseClient, reference}) => {
      const provisioner = new Provisioner({
        monitor: monitor.childMonitor('provisioner'),
        provisionerId: cfg.app.provisionerId,
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

}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}

module.exports = load;
