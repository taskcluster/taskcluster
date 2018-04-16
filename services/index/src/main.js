#!/usr/bin/env node
var path        = require('path');
var debug       = require('debug')('index:bin:server');
var taskcluster = require('taskcluster-client');
var data        = require('./data');
var Handlers    = require('./handlers');
var v1          = require('./api');
var Config      = require('typed-env-config');
var loader      = require('taskcluster-lib-loader');
var monitor     = require('taskcluster-lib-monitor');
var validator   = require('taskcluster-lib-validate');
var App         = require('taskcluster-lib-app');
var docs        = require('taskcluster-lib-docs');

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
      account:          cfg.app.azureAccount,
      table:            cfg.app.indexedTaskTableName,
      credentials:      cfg.taskcluster.credentials,
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      monitor:          monitor.prefix('table.indexedtasks'),
    }),
  },
  Namespace: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => data.Namespace.setup({
      account:          cfg.app.azureAccount,
      table:            cfg.app.namespaceTableName,
      credentials:      cfg.taskcluster.credentials,
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      monitor:          monitor.prefix('table.namespaces'),
    }),
  },

  // Create a validator
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'index/v1/',
      publish:          cfg.app.publishMetaData,
      aws:    cfg.aws,
    }),
  },

  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      credentials: cfg.taskcluster.credentials,
    }),
  },

  queueEvents: {
    requires: [],
    setup: () => new taskcluster.QueueEvents(),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.monitoring.project || 'taskcluster-index',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  docs: {
    requires: ['cfg', 'validator'],
    setup: ({cfg, validator}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      publish:          cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: v1.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  api: {
    requires: ['cfg', 'validator', 'IndexedTask', 'Namespace', 'monitor', 'queue'],
    setup: async ({cfg, validator, IndexedTask, Namespace, monitor, queue}) => v1.setup({
      context: {
        queue,
        validator,
        IndexedTask,
        Namespace,
      },
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.app.publishMetaData,
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'index/v1/api.json',
      aws:              cfg.aws,
      validator,
      monitor:          monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: async ({cfg, api, docs}) => {
      let app = App(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
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
