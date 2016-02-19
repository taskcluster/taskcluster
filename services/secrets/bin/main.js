#!/usr/bin/env node
import Debug from 'debug';
import api from '../lib/api';
import data from '../lib/data';
import assert from 'assert';
import base from 'taskcluster-base';
import path from 'path';
import common from '../lib/common';
import Promise from 'promise';
import _ from 'lodash';
import loader from 'taskcluster-lib-loader';
import app from 'taskcluster-lib-app';
import taskcluster from 'taskcluster-client';
import stats from 'taskcluster-lib-stats';

let debug = Debug('secrets:server');

var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile})
  },

  drain: {
    requires: ['cfg', 'process'],
    setup: ({cfg, process}) => {
      if (cfg.influx.connectionString) {
        var drain = common.buildInfluxStatsDrain(
          cfg.influx.connectionString,
          cfg.influx.maxDelay,
          cfg.influx.maxPendingPoints);
        // Start monitoring the process
        stats.startProcessUsageReporting({
          component:  cfg.taskclusterSecrets.statsComponent,
          drain, process,
        });
      } else {
        debug("Not loading Influx -- no connection string");
        return new stats.NullDrain();
      }
    },
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => common.buildValidator(cfg)
  },

  entity: {
    requires: ['cfg', 'drain', 'process'],
    setup: ({cfg, drain, process}) => data.SecretEntity.setup({
      account:          cfg.azure.accountName,
      credentials:      cfg.taskcluster.credentials,
      table:            cfg.azure.tableName,
      cryptoKey:        cfg.azure.cryptoKey,
      signingKey:       cfg.azure.signingKey,
      component:        cfg.taskclusterSecrets.statsComponent,
      drain,
      process,
    })
  },

  router: {
    requires: ['cfg', 'entity', 'validator', 'drain'],
    setup: ({cfg, entity, validator, drain}) => api.setup({
      context:          {cfg, entity},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.taskclusterSecrets.publishMetaData === 'true',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'secrets/v1/api.json',
      aws:              cfg.aws,
      component:        cfg.taskclusterSecrets.statsComponent,
      drain,
      validator,
    })
  },

  server: {
    requires: ['cfg', 'router'],
    setup: ({cfg, router}) => {
      let secretsApp = app({
        port:           Number(process.env.PORT || cfg.server.port),
        env:            cfg.server.env,
        forceSSL:       cfg.server.forceSSL,
        trustProxy:     cfg.server.trustProxy
      });

      // Mount API router
      secretsApp.use('/v1', router);

      // Create server
      return secretsApp.createServer();
    }
  },

  expire: {
    requires: ['cfg', 'entity'],
    setup: async ({cfg, entity}) => {
      // Find an secret expiration delay
      var delay = cfg.taskclusterSecrets.secretExpirationDelay;
      var now   = taskcluster.fromNow(delay);
      assert(!_.isNaN(now), "Can't have NaN as now");

      debug("Expiring secrets");
      let count = await entity.expire(now);
      debug("Expired " + count + " secrets");
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
