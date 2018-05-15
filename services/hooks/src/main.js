const data = require('./data');
const debug = require('debug')('hooks:bin:server');
const path = require('path');
const Promise = require('promise');
const taskcreator = require('./taskcreator');
const validator = require('taskcluster-lib-validate');
const v1 = require('./v1');
const _ = require('lodash');
const Scheduler = require('./scheduler');
const AWS = require('aws-sdk');
const config = require('typed-env-config');
const loader = require('taskcluster-lib-loader');
const app = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
const monitor = require('taskcluster-lib-monitor');
const taskcluster = require('taskcluster-client');

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.monitoring.project || 'taskcluster-hooks',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  Hook: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({cfg, process, monitor}) => {
      return data.Hook.setup({
        table: cfg.app.hookTableName,
        monitor: monitor.prefix('table.hooks'),
        account: cfg.azure.accountName,
        cryptoKey: cfg.azure.cryptoKey,
        signingKey: cfg.azure.signingKey,
        credentials: cfg.taskcluster.credentials,
      });
    },
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return validator({
        prefix:  'hooks/v1/',
        publish:          cfg.app.publishMetaData,
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

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
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
