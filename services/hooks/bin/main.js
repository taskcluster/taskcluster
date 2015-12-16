#!/usr/bin/env node
var base        = require('taskcluster-base');
var data        = require('../hooks/data');
var debug       = require('debug')('hooks:bin:server');
var path        = require('path');
var Promise     = require('promise');
var taskcreator = require('../hooks/taskcreator');
var v1          = require('../routes/v1');
var _           = require('lodash');
var Scheduler   = require('../hooks/scheduler');
var AWS         = require('aws-sdk-promise');
// These will exist in taskcluster-base, when we move to the next version.
var config      = require('typed-env-config');
var loader      = require('taskcluster-lib-loader');

// Create component loader
var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  influx: {
    requires: ['cfg'],
    setup: ({cfg}) => new base.stats.Influx(cfg.influx),
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
      return base.validator({
        folder:        path.join(__dirname, '..', 'schemas'),
        constants:     require('../schemas/constants'),
        publish:       cfg.app.publishMetaData,
        schemaPrefix:  'hooks/v1/',
        aws:           cfg.aws.validator,
        preload: [
          'http://schemas.taskcluster.net/queue/v1/task-status.json'
        ]
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
    requires: ['cfg', 'validator', 'Hook', 'taskcreator'],
    setup: ({cfg, validator, Hook, taskcreator}) => {
      return v1.setup({
        context: {Hook, taskcreator},
        validator,
        authBaseUrl:      cfg.taskcluster.authBaseUrl,
        publish:          cfg.app.publishMetaData,
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'hooks/v1/api.json',
        aws:              cfg.aws.validator,
      });
    },
  },

  server: {
    requires: ['cfg', 'router'],
    setup: ({cfg, router}) => {
      let app = base.app(cfg.server);
      app.use('/v1', router);
      return app.createServer();
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
