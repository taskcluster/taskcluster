#!/usr/bin/env node
const debug = require('debug')('index:bin:server');
const taskcluster = require('taskcluster-client');
const data = require('./data');
const Handlers = require('./handlers');
const builder = require('./api');
const Config = require('typed-env-config');
const loader = require('taskcluster-lib-loader');
const Monitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const App = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
const {sasCredentials} = require('taskcluster-lib-azure');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');

// Create component loader
var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => Config({profile}),
  },

  // Configure IndexedTask and Namespace entities
  IndexedTask: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.IndexedTask.setup({
      tableName: cfg.app.indexedTaskTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.indexedTaskTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
    }),
  },

  Namespace: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.Namespace.setup({
      tableName: cfg.app.namespaceTableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.app.namespaceTableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
    }),
  },

  // Create a validator
  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'index',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  queueEvents: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.QueueEvents({
      rootUrl: cfg.taskcluster.rootUrl,
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => new Monitor({
      projectName: cfg.monitoring.project || 'taskcluster-index',
      level: config.app.level,
      enable: cfg.monitoring.enable,
      mock: profile === 'test',
      processName: process,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-index',
      tier: 'core',
      publish: cfg.app.publishMetaData,
      schemaset,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  api: {
    requires: ['cfg', 'schemaset', 'IndexedTask', 'Namespace', 'monitor', 'queue'],
    setup: async ({cfg, schemaset, IndexedTask, Namespace, monitor, queue}) => builder.build({
      context: {
        queue,
        IndexedTask,
        Namespace,
      },
      rootUrl: cfg.taskcluster.rootUrl,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      schemaset,
      monitor: monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: async ({cfg, api, docs}) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: cfg.pulse.namespace,
        monitor,
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  handlers: {
    requires: ['IndexedTask', 'Namespace', 'queue', 'queueEvents', 'cfg', 'monitor', 'pulseClient'],
    setup: async ({IndexedTask, Namespace, queue, queueEvents, cfg, monitor, pulseClient}) => {
      var handlers = new Handlers({
        IndexedTask: IndexedTask,
        Namespace: Namespace,
        queue: queue,
        queueEvents: queueEvents,
        credentials: cfg.pulse,
        queueName: cfg.app.listenerQueueName,
        routePrefix: cfg.app.routePrefix,
        monitor: monitor.prefix('handlers'),
        pulseClient: pulseClient,
      });

      // Start listening for events and handle them
      await handlers.setup();

      return handlers;
    },
  },

  expire: {
    requires: ['cfg', 'monitor', 'IndexedTask', 'Namespace'],
    setup: ({cfg, monitor, IndexedTask, Namespace}) => {
      return monitor.oneShot('expire', async () => {
        const now = taskcluster.fromNow(cfg.app.expirationDelay);

        debug('Expiring namespaces');
        const namespaces = await Namespace.expireEntries(now);
        debug(`Expired ${namespaces} namespaces`);
        debug('Expiring indexed tasks');
        const tasks = await IndexedTask.expireTasks(now);
        debug(`Expired ${tasks} tasks`);
      });
    },
  },
}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2]).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

module.exports = load;
