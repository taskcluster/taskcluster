#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('index:bin:server');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var data        = require('../index/data');
var Handlers    = require('../index/handlers');
var v1          = require('../routes/api/v1');
var loader      = require('taskcluster-lib-loader');

// Create component loader
var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  // Configure IndexedTask and Namespace entities
  IndexedTask: {
    requires: ['cfg'],
    setup: ({cfg}) => data.IndexedTask.setup({
      account:          cfg.app.azureAccount,
      table:            cfg.app.indexedTaskTableName,
      credentials:      cfg.taskcluster.credentials,
      authBaseUrl:      cfg.taskcluster.authBaseUrl
    })
  },
  Namespace: {
    requires: ['cfg'],
    setup: ({cfg}) => data.Namespace.setup({
      account:          cfg.app.azureAccount,
      table:            cfg.app.namespaceTableName,
      credentials:      cfg.taskcluster.credentials,
      authBaseUrl:      cfg.taskcluster.authBaseUrl
    })
  },

  // Create a validator
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      folder:           path.join(__dirname, '..', 'schemas'),
      constants:        require('../schemas/constants'),
      publish:          cfg.app.publishMetaData,
      schemaPrefix:     'index/v1/',
      aws:              cfg.aws
    })
  },

  // Create InfluxDB connection for submitting statistics
  drain: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.influx && cfg.influx.connectionString) {
        return new base.stats.Influx(cfg.influx)
      }
      return new base.stats.NullDrain();
    }
  },

  // Configure queue and queueEvents
  queue: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Queue({
      credentials: cfg.taskcluster.credentials
    })
  },

  queueEvents: {
    requires: [],
    setup: () => new taskcluster.QueueEvents()
  },

  // Start monitoring the process
  monitor: {
    requires: ['cfg', 'drain'],
    setup: ({cfg, drain}) => base.stats.startProcessUsageReporting({
      drain:      drain,
      component:  cfg.app.statsComponent,
      process:    'server'
    })
  },

  api: {
    requires: ['cfg', 'validator', 'IndexedTask', 'Namespace', 'drain', 'queue'],
    setup: async ({cfg, validator, IndexedTask, Namespace, drain, queue}) => v1.setup({
      context: {
        queue:          queue,
        validator:      validator,
        IndexedTask:    IndexedTask,
        Namespace:      Namespace
      },
      validator:        validator,
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.app.publishMetaData,
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'index/v1/api.json',
      aws:              cfg.aws,
      component:        cfg.app.statsComponent,
      drain:            drain
    })
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({cfg, api}) => {
      // Create app
      let app = base.app(cfg.server);

      // Mount API router
      app.use('/v1', api);

      // Create server
      return app.createServer();
    }
  },

  handlers: {
    requires: ['IndexedTask', 'Namespace', 'queue', 'queueEvents', 'cfg', 'drain'],
    setup: async ({IndexedTask, Namespace, queue, queueEvents, cfg, drain}) => {
      var handlers = new Handlers({
        IndexedTask:        IndexedTask,
        Namespace:          Namespace,
        queue:              queue,
        queueEvents:        queueEvents,
        credentials:        cfg.pulse,
        queueName:          cfg.app.listenerQueueName,
        routePrefix:        cfg.app.routePrefix,
        drain:              drain,
        component:          cfg.app.statsComponent
      });

      // Start listening for events and handle them
      return handlers.setup();
    }
  },
}, ['profile']);

// If server.js is executed start the server
if (!module.parent) {
  load('server', {
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
