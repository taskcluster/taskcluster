const loader = require('taskcluster-lib-loader');
const taskcluster = require('taskcluster-client');
const App = require('taskcluster-lib-app');
const monitorManager = require('./monitor');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const libDocs = require('taskcluster-lib-docs');
const data = require('./data');
const builder = require('./api');
const {sasCredentials} = require('taskcluster-lib-azure');

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
    }),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'WorkerType', 'providers'],
    setup: async ({cfg, schemaset, monitor, WorkerType, providers}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        WorkerType,
        providers,
      },
      monitor: monitor.monitor('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libDocs({
      projectName: 'taskcluster-worker-manager',
      schemaset,
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

  notify: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Notify(cfg.taskcluster),
  },

  providers: {
    requires: ['cfg', 'monitor', 'notify'],
    setup: ({cfg, monitor, notify}) => {
      const _providers = {};
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
          monitor: monitor.monitor(name),
          ...meta,
        });
      });
      return _providers;
    },
  },

  provisioner: {
    requires: ['cfg', 'queue', 'monitor', 'WorkerType', 'providers', 'notify'],
    setup: async ({cfg, queue, monitor, WorkerType, providers, notify}) => {
      const provisioner = new Provisioner({
        queue,
        monitor: monitor.monitor('provisioner'),
        provisionerId: cfg.app.provisionerId,
        WorkerType,
        providers,
        notify,
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
