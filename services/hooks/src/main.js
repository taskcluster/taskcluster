require('../../prelude');
const data = require('./data');
const debug = require('debug')('hooks:bin:server');
const taskcreator = require('./taskcreator');
const SchemaSet = require('taskcluster-lib-validate');
const tcdb = require('taskcluster-db');
const builder = require('./api');
const Scheduler = require('./scheduler');
const config = require('taskcluster-lib-config');
const loader = require('taskcluster-lib-loader');
const {App} = require('taskcluster-lib-app');
const libReferences = require('taskcluster-lib-references');
const {MonitorManager} = require('taskcluster-lib-monitor');
const taskcluster = require('taskcluster-client');
const exchanges = require('./exchanges');
const libPulse = require('taskcluster-lib-pulse');
const HookListeners = require('./listeners');

require('./monitor');

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({
      profile,
      serviceName: 'hooks',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'github',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({cfg, process, monitor}) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'hooks',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  Hook: {
    requires: ['cfg', 'process', 'monitor', 'db'],
    setup: ({cfg, process, monitor, db}) => {
      return data.Hook.setup({
        db,
        serviceName: 'hooks',
        tableName: cfg.app.hookTableName,
        monitor: monitor.childMonitor('table.hooks'),
        cryptoKey: cfg.azure.cryptoKey,
        signingKey: cfg.azure.signingKey,
      });
    },
  },

  LastFire: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}) => {
      return data.LastFire.setup({
        db,
        serviceName: 'hooks',
        tableName: cfg.app.lastFireTableName,
        monitor: monitor.childMonitor('table.lastFireTable'),
        signingKey: cfg.azure.signingKey,
      });
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return new SchemaSet({
        serviceName: 'hooks',
      });
    },
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new libPulse.Client({
        namespace: 'taskcluster-hooks',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'monitor', 'pulseClient'],
    setup: async ({cfg, schemaset, monitor, pulseClient}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
      monitor: monitor.childMonitor('publisher'),
    }),
  },

  taskcreator: {
    requires: ['cfg', 'LastFire', 'monitor'],
    setup: ({cfg, LastFire, monitor}) => new taskcreator.TaskCreator({
      ...cfg.taskcluster,
      LastFire,
      monitor: monitor.childMonitor('taskcreator'),
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
      context: {Hook, LastFire, taskcreator, publisher, denylist: cfg.pulse.denylist},
      schemaset,
      monitor: monitor.childMonitor('api'),
    }),
  },

  Queues: {
    requires: ['cfg', 'process', 'monitor', 'db'],
    setup: ({cfg, process, monitor, db}) => {
      return data.Queues.setup({
        db,
        serviceName: 'hooks',
        tableName: cfg.app.queuesTableName,
        monitor: monitor.childMonitor('table.queues'),
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
        monitor: monitor.childMonitor('listeners'),
      });
      await listeners.setup();
      return listeners;
    },
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('hooks')],
    }).generateReferences(),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
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
        monitor: monitor.childMonitor('scheduler'),
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
    setup: ({cfg, Hook, LastFire, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
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
  load.crashOnError(process.argv[2]);
}

module.exports = load;
