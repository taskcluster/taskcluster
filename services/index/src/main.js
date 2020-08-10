require('../../prelude');
const debug = require('debug')('index:bin:server');
const taskcluster = require('taskcluster-client');
const tcdb = require('taskcluster-db');
const Handlers = require('./handlers');
const builder = require('./api');
const Config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const { MonitorManager } = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const { App } = require('taskcluster-lib-app');
const libReferences = require('taskcluster-lib-references');
const { Client, pulseCredentials } = require('taskcluster-lib-pulse');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => Config({
      profile,
      serviceName: 'index',
    }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'index',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  // Create a validator
  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'index',
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.Queue({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  queueEvents: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.QueueEvents({
      rootUrl: cfg.taskcluster.rootUrl,
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'index',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), MonitorManager.reference('index')],
    }).generateReferences(),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'queue', 'db'],
    setup: async ({ cfg, schemaset, monitor, queue, db }) => builder.build({
      context: {
        queue,
        db,
      },
      rootUrl: cfg.taskcluster.rootUrl,
      schemaset,
      monitor: monitor.childMonitor('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new Client({
        namespace: 'taskcluster-index',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse),
      });
    },
  },

  handlers: {
    requires: ['queue', 'queueEvents', 'cfg', 'monitor', 'pulseClient', 'db'],
    setup: async ({ queue, queueEvents, cfg, monitor, pulseClient, db }) => {
      let handlers = new Handlers({
        queue: queue,
        queueEvents: queueEvents,
        credentials: cfg.pulse,
        queueName: cfg.app.listenerQueueName,
        routePrefix: cfg.app.routePrefix,
        monitor: monitor.childMonitor('handlers'),
        pulseClient: pulseClient,
        db,
      });

      // Start listening for events and handle them
      await handlers.setup();

      return handlers;
    },
  },

  expire: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({ cfg, monitor, db }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Expiring namespaces');
        const namespaces = (await db.fns.expire_index_namespaces())[0].expire_index_namespaces;
        debug(`Expired ${namespaces} namespaces`);
        debug('Expiring indexed tasks');
        const tasks = (await db.fns.expire_indexed_tasks())[0].expire_indexed_tasks;
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
  load.crashOnError(process.argv[2]);
}

module.exports = load;
