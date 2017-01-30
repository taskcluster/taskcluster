#!/usr/bin/env node
var data        = require('./data');
var debug       = require('debug')('hooks:bin:server');
var path        = require('path');
var Promise     = require('promise');
var taskcreator = require('./taskcreator');
var validator   = require('taskcluster-lib-validate');
var v1          = require('./v1');
var _           = require('lodash');
var Scheduler   = require('./scheduler');
var AWS         = require('aws-sdk');
var config      = require('typed-env-config');
var loader      = require('taskcluster-lib-loader');
var app         = require('taskcluster-lib-app');
var monitor     = require('taskcluster-lib-monitor');

// Create component loader
var load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'taskcluster-hooks',
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  Hook: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({cfg, process, monitor}) => {
      return data.Hook.setup(_.defaults({
        table:        cfg.app.hookTable,
        monitor:      monitor.prefix(cfg.app.hookTable.toLowerCase()),
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
    },
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
    requires: ['cfg', 'validator', 'Hook', 'taskcreator', 'monitor'],
    setup: ({cfg, validator, Hook, taskcreator, monitor}) => {
      return v1.setup({
        context: {Hook, taskcreator},
        validator,
        authBaseUrl:      cfg.taskcluster.authBaseUrl,
        publish:          cfg.app.publishMetaData,
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'hooks/v1/api.json',
        aws:              cfg.aws.validator,
        monitor,
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
        pollingDelay: cfg.app.scheduler.pollingDelay,
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
