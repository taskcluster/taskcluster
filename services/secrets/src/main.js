#!/usr/bin/env node
const Debug = require('debug');
const builder = require('../src/api');
const data = require('../src/data');
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
const {sasCredentials} = require('taskcluster-lib-azure');

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

  Secret: {
    requires: ['cfg', 'monitor', 'process'],
    setup: ({cfg, monitor, process}) => data.Secret.setup({
      tableName: cfg.azure.tableName,
      credentials: sasCredentials({
        accountId: cfg.azure.accountId,
        tableName: cfg.azure.tableName,
        rootUrl: cfg.taskcluster.rootUrl,
        credentials: cfg.taskcluster.credentials,
      }),
      cryptoKey:        cfg.azure.cryptoKey,
      signingKey:       cfg.azure.signingKey,
      monitor:          monitor.prefix('table.secrets'),
    }),
  },

  api: {
    requires: ['cfg', 'Secret', 'schemaset', 'monitor'],
    setup: async ({cfg, Secret, schemaset, monitor}) => builder.build({
      rootUrl:          cfg.taskcluster.rootUrl,
      context:          {cfg, Secret},
      publish:          cfg.app.publishMetaData,
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
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

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      port: Number(process.env.PORT || cfg.server.port),
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  expire: {
    requires: ['cfg', 'Secret'],
    setup: async ({cfg, Secret}) => {
      // Find an secret expiration delay
      var delay = cfg.app.secretExpirationDelay;
      var now   = taskcluster.fromNow(delay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      debug('Expiring secrets');
      let count = await Secret.expire(now);
      debug('Expired ' + count + ' secrets');
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
