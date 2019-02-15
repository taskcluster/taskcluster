const data = require('./data');
const debug = require('debug')('hooks:bin:server');
const path = require('path');
const Promise = require('promise');
const taskcreator = require('./taskcreator');
const SchemaSet = require('taskcluster-lib-validate');
const builder = require('./v1');
const _ = require('lodash');
const Scheduler = require('./scheduler');
const AWS = require('aws-sdk');
const config = require('typed-env-config');
const loader = require('taskcluster-lib-loader');
const App = require('taskcluster-lib-app');
const docs = require('taskcluster-lib-docs');
const Monitor = require('taskcluster-lib-monitor');
const taskcluster = require('taskcluster-client');
const {sasCredentials} = require('taskcluster-lib-azure');
const exchanges = require('./exchanges');
const libPulse = require('taskcluster-lib-pulse');
const HookListeners = require('./listeners');

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => new Monitor({
      projectName: 'taskcluster-hooks',
      level: cfg.app.level,
      enable: cfg.monitoring.enable,
      mock: profile !== 'production',
      processName: process,
    }),
  },

  Hook: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({cfg, process, monitor}) => {
      return data.Hook.setup({
        tableName: cfg.app.hookTableName,
        monitor: monitor.prefix('table.hooks'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.hookTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        cryptoKey: cfg.azure.cryptoKey,
        signingKey: cfg.azure.signingKey,
      });
    },
  },

  LastFire: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return data.LastFire.setup({
        tableName: cfg.app.lastFireTableName,
        monitor: monitor.prefix('table.lastFireTable'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.lastFireTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        signingKey: cfg.azure.signingKey,
      });
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return new SchemaSet({
        serviceName: 'hooks',
        publish: cfg.app.publishMetaData,
        aws: cfg.aws.validator,
      });
    },
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new libPulse.Client({
        namespace: 'taskcluster-hooks',
        monitor,
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'monitor', 'pulseClient'],
    setup: async ({cfg, schemaset, monitor, pulseClient}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      credentials: cfg.pulse,
      schemaset,
      namespace: 'taskcluster-hooks',
      publish: cfg.app.publishMetaData,
      validator: await schemaset.validator(cfg.taskcluster.rootUrl),
      aws: cfg.aws.validator,
      monitor: monitor.prefix('publisher'),
    }),
  },

  taskcreator: {
    requires: ['cfg', 'LastFire', 'monitor'],
    setup: ({cfg, LastFire, monitor}) => new taskcreator.TaskCreator({
      ...cfg.taskcluster,
      LastFire,
      monitor: monitor.prefix('taskcreator'),
    }),
  },

  notify: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Notify({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
      authorizedScopes: ['notify:email:*'],
    }),
  },

  api: {
    requires: ['cfg', 'schemaset', 'Hook', 'LastFire', 'taskcreator', 'monitor', 'publisher', 'pulseClient'],
    setup: ({cfg, schemaset, Hook, LastFire, taskcreator, monitor, publisher, pulseClient}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {Hook, LastFire, taskcreator, publisher},
      schemaset,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws.validator,
      monitor,
    }),
  },

  Queues: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({cfg, process, monitor}) => {
      return data.Queues.setup({
        tableName: cfg.app.queuesTableName,
        monitor: monitor.prefix('table.queues'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: cfg.app.queuesTableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        signingKey: cfg.azure.signingKey,
      });
    },
  },

  listeners: {
    requires: ['Hook', 'taskcreator', 'Queues', 'pulseClient', 'monitor'],
    setup: async ({Hook, taskcreator, Queues, pulseClient, monitor}) => {
      let listeners = new HookListeners({
        Hook,
        Queues,
        taskcreator,
        client: pulseClient,
        monitor,
      });
      await listeners.setup();
      return listeners;
    },
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-hooks',
      tier: 'core',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'events',
          reference: exchanges.reference(),
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
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  schedulerNoStart: {
    requires: ['cfg', 'Hook', 'taskcreator', 'notify', 'monitor'],
    setup: ({cfg, Hook, taskcreator, notify, monitor}) => {
      return new Scheduler({
        Hook,
        taskcreator,
        notify,
        monitor: monitor.prefix('scheduler'),
        pollingDelay: cfg.app.scheduler.pollingDelay,
      });
    },
  },

  scheduler: {
    requires: ['schedulerNoStart'],
    setup: ({schedulerNoStart}) => schedulerNoStart.start(),
  },

  expires: {
    requires: ['cfg', 'Hook', 'LastFire', 'monitor'],
    setup: ({cfg, Hook, LastFire, monitor}) => {
      return monitor.oneShot('expire LastFires', async () => {
        const expirationTime = taskcluster.fromNow(cfg.app.lastFiresExpirationDelay);
        debug('Expiring lastFires rows');
        const count = await LastFire.expires(Hook, expirationTime);
        debug(`Expired ${count} rows`);
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
