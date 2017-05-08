#!/usr/bin/env node
import Debug from 'debug';
import api from '../lib/api';
import data from '../lib/data';
import assert from 'assert';
import path from 'path';
import Promise from 'promise';
import _ from 'lodash';
import loader from 'taskcluster-lib-loader';
import validator from 'taskcluster-lib-validate';
import monitor from 'taskcluster-lib-monitor';
import app from 'taskcluster-lib-app';
import docs from 'taskcluster-lib-docs';
import taskcluster from 'taskcluster-client';
import config from 'typed-env-config';

let debug = Debug('secrets:server');

var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'taskcluster-secrets',
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'secrets/v1/',
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
      monitor:          monitor.prefix(cfg.azure.tableName.toLowerCase()),
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
      references: [
        {
          name: 'api',
          reference: api.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  server: {
    requires: ['cfg', 'router', 'docs'],
    setup: ({cfg, router, docs}) => {
      let secretsApp = app({
        port:           Number(process.env.PORT || cfg.server.port),
        env:            cfg.server.env,
        forceSSL:       cfg.server.forceSSL,
        trustProxy:     cfg.server.trustProxy,
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
