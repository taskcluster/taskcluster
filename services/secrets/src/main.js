#!/usr/bin/env node
const Debug = require('debug');
const api = require('../src/api');
const data = require('../src/data');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const loader = require('taskcluster-lib-loader');
const validator = require('taskcluster-lib-validate');
const monitor = require('taskcluster-lib-monitor');
const app = require('taskcluster-lib-app');
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
      project: cfg.monitoring.project || 'taskcluster-secrets',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'secrets/v1/',
      publish: cfg.taskclusterSecrets.publishMetaData,
      aws: cfg.aws,
    }),
  },

  entity: {
    requires: ['cfg', 'monitor', 'process'],
    setup: ({cfg, monitor, process}) => data.SecretEntity.setup({
      account:          cfg.azure.accountName,
      credentials:      cfg.taskcluster.credentials,
      table:            cfg.azure.tableName,
      cryptoKey:        cfg.azure.cryptoKey,
      signingKey:       cfg.azure.signingKey,
      monitor:          monitor.prefix('table.secrets'),
    }),
  },

  router: {
    requires: ['cfg', 'entity', 'validator', 'monitor'],
    setup: ({cfg, entity, validator, monitor}) => api.setup({
      context:          {cfg, entity},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.taskclusterSecrets.publishMetaData,
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'secrets/v1/api.json',
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      validator,
    }),
  },

  docs: {
    requires: ['cfg', 'validator'],
    setup: ({cfg, validator}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      publish: cfg.taskclusterSecrets.publishMetaData,
      references: [
        {
          name: 'api',
          reference: api.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  server: {
    requires: ['cfg', 'router', 'docs'],
    setup: ({cfg, router, docs}) => {
      let secretsApp = app({
        port:           Number(process.env.PORT || cfg.server.port),
        env:            cfg.server.env,
        forceSSL:       cfg.server.forceSSL,
        trustProxy:     cfg.server.trustProxy,
        docs,
      });

      // Mount API router
      secretsApp.use('/v1', router);

      // Create server
      return secretsApp.createServer();
    },
  },

  expire: {
    requires: ['cfg', 'entity'],
    setup: async ({cfg, entity}) => {
      // Find an secret expiration delay
      var delay = cfg.taskclusterSecrets.secretExpirationDelay;
      var now   = taskcluster.fromNow(delay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      debug('Expiring secrets');
      let count = await entity.expire(now);
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
