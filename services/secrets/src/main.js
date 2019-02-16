#!/usr/bin/env node
const Debug = require('debug');
const builder = require('../src/api');
const data = require('../src/data');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const loader = require('taskcluster-lib-loader');
const SchemaSet = require('taskcluster-lib-validate');
const monitorBuilder = require('./monitor');
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
    setup: ({process, profile, cfg}) => monitorBuilder.setup({
      level: cfg.app.level,
      enable: cfg.monitoring.enable,
      mock: profile !== 'production',
      processName: process,
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
      cryptoKey: cfg.azure.cryptoKey,
      signingKey: cfg.azure.signingKey,
      monitor: monitor.monitor('table.secrets'),
    }),
  },

  api: {
    requires: ['cfg', 'Secret', 'schemaset', 'monitor'],
    setup: async ({cfg, Secret, schemaset, monitor}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {cfg, Secret},
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.monitor('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-secrets',
      tier: 'core',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'logs',
          reference: monitorBuilder.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
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
    requires: ['cfg', 'Secret', 'monitor'],
    setup: ({cfg, Secret, monitor}) => {
      return monitor.monitor().oneShot('expire', async () => {
        const delay = cfg.app.secretExpirationDelay;
        const now = taskcluster.fromNow(delay);

        debug('Expiring secrets');
        const count = await Secret.expire(now);
        debug('Expired ' + count + ' secrets');
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
