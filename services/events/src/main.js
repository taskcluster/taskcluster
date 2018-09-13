#!usr/bin/env node
const loader = require('taskcluster-lib-loader');
const App = require('taskcluster-lib-app');
const monitor = require('taskcluster-lib-monitor');
const debug = require('debug')('events:main');
const config = require('typed-env-config');
const builder = require('./api');
const taskcluster = require('taskcluster-client');
const SchemaSet = require('taskcluster-lib-validate');
const Listeners = require('./listeners');
const docs = require('taskcluster-lib-docs');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
      projectName: 'taskcluster-events',
      enable: cfg.monitor.enable,
      mock: cfg.monitor.mock, // false in production
      process,
    }),
  },

  // Create a validator
  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'events',
    }),
  },

  docs: {
    requires: ['cfg'],
    setup: ({cfg}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      publish: cfg.app.publishMetaData,
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

  listeners : {
    requires: ['cfg'],
    setup : async ({cfg}) => {
      var listeners = new Listeners({
        credentials: cfg.pulse,
      });

      // Start a PulseConnection to add listeners
      await listeners.setup();
      return listeners;
    },
  },

  api : {
    requires: ['cfg', 'monitor', 'listeners', 'docs', 'schemaset'],
    setup : ({cfg, monitor, listeners, docs, schemaset}) => builder.build({
      rootUrl:  cfg.taskcluster.rootUrl,
      context:  {
        listeners,
      },
      monitor:  monitor.prefix('api'),
      schemaset
    }),
  },

  server: {
    requires: ['cfg', 'monitor', 'api'],
    setup: ({cfg, monitor, api}) => App({
      port: cfg.server.port,
      env: cfg.server.env, // 'development' or 'production'
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

}, ['profile', 'process']);

// If this file is executed launch component from first argument
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
