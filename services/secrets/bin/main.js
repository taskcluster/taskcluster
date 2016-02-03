#!/usr/bin/env node
import Debug from 'debug';
import api from '../lib/api';
import data from '../lib/data';
import assert from 'assert';
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
    setup: ({profile}) => common.loadConfig(profile)
  },

  drain: {
    requires: ['cfg', 'process'],
    setup: ({cfg, process}) => {
      if (cfg.get('influx:connectionString')) {
        drain = common.buildInfluxStatsDrain(
          cfg.get('influx:connectionString'),
          cfg.get('influx:maxDelay'),
          cfg.get('influx:maxPendingPoints'));
        // Start monitoring the process
        stats.startProcessUsageReporting({
          component:  cfg.get('taskclusterSecrets:statsComponent'),
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
      account:          cfg.get('azure:accountName'),
      credentials:      cfg.get('taskcluster:credentials'),
      table:            cfg.get('azure:tableName'),
      cryptoKey:        cfg.get('azure:cryptoKey'),
      signingKey:       cfg.get('azure:signingKey'),
      component:        cfg.get('taskclusterSecrets:statsComponent'),
      drain,
      process,
    })
  },

  router: {
    requires: ['cfg', 'entity', 'validator', 'drain'],
    setup: ({cfg, entity, validator, drain}) => api.setup({
      context:          {cfg, entity},
      authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
      publish:          cfg.get('taskclusterSecrets:publishMetaData') === 'true',
      baseUrl:          cfg.get('server:publicUrl') + '/v1',
      referencePrefix:  'secrets/v1/api.json',
      aws:              cfg.get('aws'),
      component:        cfg.get('taskclusterSecrets:statsComponent'),
      drain,
      validator,
    })
  },

  server: {
    requires: ['cfg', 'router'],
    setup: ({cfg, router}) => {
      let secretsApp = app({
        port:           Number(process.env.PORT || cfg.get('server:port')),
        env:            cfg.get('server:env'),
        forceSSL:       cfg.get('server:forceSSL'),
        trustProxy:     cfg.get('server:trustProxy')
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
      var delay = cfg.get('taskclusterSecrets:secretExpirationDelay');
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
