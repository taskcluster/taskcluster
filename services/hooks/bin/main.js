#!/usr/bin/env node
var data        = require('../hooks/data');
var debug       = require('debug')('hooks:bin:server');
var path        = require('path');
var Promise     = require('promise');
var taskcreator = require('../hooks/taskcreator');
var raven       = require('raven');
var validator   = require('taskcluster-lib-validate');
var stats       = require('taskcluster-lib-stats');
var v1          = require('../routes/v1');
var _           = require('lodash');
var Scheduler   = require('../hooks/scheduler');
var AWS         = require('aws-sdk');
var config      = require('typed-env-config');
var loader      = require('taskcluster-lib-loader');
var app         = require('taskcluster-lib-app');

// Create component loader
var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  influx: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.influx && cfg.influx.connectionString) {
        return new stats.Influx(cfg.influx)
      } else {
        debug("Not loading Influx -- no connection string");
        return new stats.NullDrain();
      }
    },
  },

  raven: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.raven.sentryDSN) {
        return new raven.Client(cfg.raven.sentryDSN);
      }
      return null;
    }
  },

  Hook: {
    requires: ['cfg', 'process', 'influx'],
    setup: ({cfg, process, influx}) => {
      return data.Hook.setup(_.defaults({
        table:        cfg.app.hookTable,
        drain:        influx,
        component:    cfg.app.component,
        process,
      }, cfg.azureTable, cfg.taskcluster));
    },
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return validator({
        prefix:  'hooks/v1/',
        aws:     cfg.aws.validator,
      });
    }
  },

  taskcreator: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcreator.TaskCreator(cfg.taskcluster),
  },

  ses: {
    requires: ['cfg'],
    setup: ({cfg}) => new AWS.SES(cfg.aws.ses),
  },

  router: {
    requires: ['cfg', 'validator', 'Hook', 'taskcreator', 'raven'],
    setup: ({cfg, validator, Hook, taskcreator, raven}) => {
      return v1.setup({
        context: {Hook, taskcreator},
        validator,
        authBaseUrl:      cfg.taskcluster.authBaseUrl,
        publish:          cfg.app.publishMetaData,
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'hooks/v1/api.json',
        aws:              cfg.aws.validator,
        raven:            raven,
      });
    },
  },

  server: {
    requires: ['cfg', 'router'],
    setup: ({cfg, router}) => {
      let hooksApp = app(cfg.server);
      hooksApp.use('/v1', router);
      return hooksApp.createServer();
    },
  },

  schedulerNoStart: {
    requires: ['cfg', 'Hook', 'taskcreator', 'ses'],
    setup: ({cfg, Hook, taskcreator, ses}) => {
      return new Scheduler({
        Hook,
        taskcreator,
        ses,
        pollingDelay: cfg.app.scheduler.pollingDelay
      });
    },
  },

  scheduler: {
    requires: ['schedulerNoStart'],
    setup: ({schedulerNoStart}) => schedulerNoStart.start(),
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
