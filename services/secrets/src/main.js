#!/usr/bin/env node
const Debug = require('debug');
const builder = require('../src/api');
const schema = require('./schema');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const loader = require('taskcluster-lib-loader');
const SchemaSet = require('taskcluster-lib-validate');
const monitor = require('taskcluster-lib-monitor');
const App = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
const taskcluster = require('taskcluster-client');
const config = require('typed-env-config');

let debug = Debug('secrets:server');

var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-secrets',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'secrets',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  db: {
    requires: ['cfg'],
    setup: ({cfg}) => schema.setup(cfg.postgres),
  },

  api: {
    requires: ['cfg', 'db', 'schemaset', 'monitor'],
    setup: async ({cfg, db, schemaset, monitor}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {cfg, db},
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.prefix('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      tier: 'core',
      schemaset,
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

  // NOTE: this would be done from the deployment scripts instead
  upgradeDb: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      await schema.upgrade(cfg.postgres);
    },
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
      port: Number(process.env.PORT || cfg.server.port),
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  expire: {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({cfg, db, monitor}) => {
      return monitor.oneShot('expire', async () => {
        const delay = cfg.app.secretExpirationDelay;
        const now = taskcluster.fromNow(delay);

        debug('Expiring secrets');
        const count = await Secret.expire(now); // TODO
        debug('Expired ' + count + ' secrets');
      });
    },
  },
}, ['process', 'profile']);

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
