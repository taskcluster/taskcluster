#!/usr/bin/env node
var path        = require('path');
var debug       = require('debug')('index:bin:server');
var taskcluster = require('taskcluster-client');
var data        = require('./data');
var Handlers    = require('./handlers');
var builder     = require('./api');
var Config      = require('typed-env-config');
var loader      = require('taskcluster-lib-loader');
var monitor     = require('taskcluster-lib-monitor');
const SchemaSet   = require('taskcluster-lib-validate');
var App         = require('taskcluster-lib-app');
var docs        = require('taskcluster-lib-docs');
const {sasCredentials} = require('taskcluster-lib-azure'); 

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
      tableName:    cfg.app.namespaceTableName,
      credentials:  sasCredentials({
        accountId:  cfg.azure.accountId,
        tableName:  cfg.app.namespaceTableName,
        rootUrl:    cfg.taskcluster.rootUrl,
        credentials:cfg.taskcluster.credentials,  
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
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: cfg.monitoring.project || 'taskcluster-index',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      publish:          cfg.app.publishMetaData,
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
      rootUrl:          cfg.taskcluster.rootUrl,
      publish:          cfg.app.publishMetaData,
      aws:              cfg.aws,
      schemaset,
      monitor:          monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: async ({cfg, api, docs}) => App({
      port:  cfg.server.port,
      env:   cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  handlers: {
    requires: ['IndexedTask', 'Namespace', 'queue', 'queueEvents', 'cfg', 'monitor'],
    setup: async ({IndexedTask, Namespace, queue, queueEvents, cfg, monitor}) => {
      var handlers = new Handlers({
        IndexedTask:        IndexedTask,
        Namespace:          Namespace,
        queue:              queue,
        queueEvents:        queueEvents,
        credentials:        cfg.pulse,
        queueName:          cfg.app.listenerQueueName,
        routePrefix:        cfg.app.routePrefix,
        monitor:            monitor.prefix('handlers'),
      });

      // Start listening for events and handle them
      await handlers.setup();

      return handlers;
    },
  },

  expire: {
    requires: ['cfg', 'monitor', 'IndexedTask', 'Namespace'],
    setup: async ({cfg, monitor, IndexedTask, Namespace}) => {
      let now = taskcluster.fromNow(cfg.app.expirationDelay);

      debug('Expiring namespaces');
      let namespaces = await Namespace.expireEntries(now);
      debug(`Expired ${namespaces} namespaces`);
      debug('Expiring indexed tasks');
      let tasks = await IndexedTask.expireTasks(now);
      debug(`Expired ${tasks} tasks`);

      monitor.count('expire.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },
}, ['process', 'profile']);

// If server.js is executed start the server
if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
