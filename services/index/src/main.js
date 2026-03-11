import '../../prelude.js';
import debugFactory from 'debug';
const debug = debugFactory('index:bin:server');
import taskcluster from '@taskcluster/client';
import tcdb from '@taskcluster/db';
import Handlers from './handlers.js';
import builder from './api.js';
import helpers from './helpers.js';
import Config from '@taskcluster/lib-config';
import loader from '@taskcluster/lib-loader';
import { MonitorManager } from '@taskcluster/lib-monitor';
import SchemaSet from '@taskcluster/lib-validate';
import { App } from '@taskcluster/lib-app';
import libReferences from '@taskcluster/lib-references';
import { Client, pulseCredentials } from '@taskcluster/lib-pulse';
import { fileURLToPath } from 'url';

// Create component loader
export const load = loader({
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

  auth: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.Auth({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
    }),
  },

  isPublicArtifact: {
    requires: ['auth'],
    setup: ({ auth }) => helpers.isPublicArtifact(auth),
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
    setup: async ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), MonitorManager.reference('index'), MonitorManager.metricsReference('index')],
    }).then(ref => ref.generateReferences()),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'queue', 'db', 'isPublicArtifact'],
    setup: async ({ cfg, schemaset, monitor, queue, db, isPublicArtifact }) => {
      const api = builder.build({
        context: {
          queue,
          db,
          isPublicArtifact,
        },
        rootUrl: cfg.taskcluster.rootUrl,
        schemaset,
        monitor: monitor.childMonitor('api'),
      });

      monitor.exposeMetrics('default');
      return api;
    },
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      keepAliveTimeoutSeconds: cfg.server.keepAliveTimeoutSeconds,
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
