const loader = require('taskcluster-lib-loader');
const taskcluster = require('taskcluster-client');
const App = require('taskcluster-lib-app');
const monitorManager = require('./monitor');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const docs = require('taskcluster-lib-docs');
const data = require('./data');
const builder = require('./api');
const {sasCredentials} = require('taskcluster-lib-azure');

const TestingProvider = require('./provider_testing');
const StaticProvider = require('./provider_static');
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
      monitor: monitor.monitor('table.workerTypes'),
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'worker-manager',
      publish: cfg.app.publishMetaData,
      rootUrl: cfg.taskcluster.rootUrl,
      aws: cfg.aws,
    }),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'WorkerType'],
    setup: async ({cfg, schemaset, monitor, WorkerType}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        WorkerType,
      },
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.monitor('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-worker-manager',
      tier: 'core',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'logs',
          reference: monitorManager.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
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

  providers: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      const _providers = {};
      Object.entries(cfg.providers).forEach(([name, meta]) => {
        switch(meta.implementation) {
          case 'testing': _providers[name] = new TestingProvider({name, monitor: monitor.monitor(name)}); break;
          case 'static': _providers[name] = new StaticProvider({name, monitor: monitor.monitor(name)}); break;
          default: throw new Error(`Unkown provider ${meta.implementation} selected for provider ${name}.`);
        }
      });
      return _providers;
    },
  },

  provisioner: {
    requires: ['cfg', 'queue', 'monitor', 'WorkerType', 'providers'],
    setup: async ({cfg, queue, monitor, WorkerType, providers}) => {
      const provisioner = new Provisioner({
        queue,
        monitor: monitor.monitor('provisioner'),
        provisionerId: cfg.app.provisionerId,
        WorkerType,
        providers,
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
