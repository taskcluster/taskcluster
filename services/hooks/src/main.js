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
var docs        = require('taskcluster-lib-docs');
var monitor     = require('taskcluster-lib-monitor');
var taskcluster = require('taskcluster-client');

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
        monitor:      monitor.prefix('table.hooks'),
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

  notify: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Notify({
      credentials: cfg.taskcluster.credentials,
      authorizedScopes: ['notify:email:*'],
    }),
  },

  router: {
    requires: ['cfg', 'validator', 'Hook', 'taskcreator', 'monitor'],
    setup: async ({cfg, validator, Hook, taskcreator, monitor}) => {

      await Hook.ensureTable();

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

  docs: {
    requires: ['cfg', 'validator'],
    setup: ({cfg, validator}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: v1.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  server: {
    requires: ['cfg', 'router', 'docs'],
    setup: ({cfg, router, docs}) => {
      let hooksApp = app({
        port:                   cfg.server.port,
        env:                    cfg.server.env,
        forceSSL:               cfg.server.forceSSL,
        trustProxy:             cfg.server.trustProxy,
        publicUrl:              cfg.server.publicUrl,
        rootDocsLink:           true, 
        docs,
      });
      hooksApp.use('/v1', router);
      return hooksApp.createServer();
    },
  },

  schedulerNoStart: {
    requires: ['cfg', 'Hook', 'taskcreator', 'notify'],
    setup: ({cfg, Hook, taskcreator, notify}) => {
      return new Scheduler({
        Hook,
        taskcreator,
        notify,
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
