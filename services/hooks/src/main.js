import '../../prelude.js';
import debugFactory from 'debug';
const debug = debugFactory('hooks:bin:server');
import taskcreator from './taskcreator';
import SchemaSet from 'taskcluster-lib-validate';
import tcdb from 'taskcluster-db';
import builder from './api.js';
import Scheduler from './scheduler';
import config from 'taskcluster-lib-config';
import loader from 'taskcluster-lib-loader';
import { App } from 'taskcluster-lib-app';
import libReferences from 'taskcluster-lib-references';
import { MonitorManager } from 'taskcluster-lib-monitor';
import taskcluster from 'taskcluster-client';
import exchanges from './exchanges.js';
import libPulse from 'taskcluster-lib-pulse';
import HookListeners from './listeners';
import './monitor';

// Create component loader
const load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'hooks',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'github',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  db: {
    requires: ["cfg", "process", "monitor"],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'hooks',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
      azureCryptoKey: cfg.azure.cryptoKey,
      dbCryptoKeys: cfg.postgres.dbCryptoKeys,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => {
      return new SchemaSet({
        serviceName: 'hooks',
      });
    },
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new libPulse.Client({
        namespace: 'taskcluster-hooks',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'monitor', 'pulseClient'],
    setup: async ({ cfg, schemaset, monitor, pulseClient }) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
      monitor: monitor.childMonitor('publisher'),
    }),
  },

  taskcreator: {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }) => new taskcreator.TaskCreator({
      ...cfg.taskcluster,
      db,
      monitor: monitor.childMonitor('taskcreator'),
    }),
  },

  notify: {
    requires: ['cfg'],
    setup: ({ cfg }) => new taskcluster.Notify({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
      authorizedScopes: ['notify:email:*'],
    }),
  },

  api: {
    requires: ['cfg', 'db', 'schemaset', 'taskcreator', 'monitor', 'publisher', 'pulseClient'],
    setup: ({ cfg, db, schemaset, taskcreator, monitor, publisher, pulseClient }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: { db, taskcreator, publisher, denylist: cfg.pulse.denylist },
      schemaset,
      monitor: monitor.childMonitor('api'),
    }),
  },

  listeners: {
    requires: ['db', 'taskcreator', 'pulseClient', 'monitor'],
    setup: async ({ db, taskcreator, pulseClient, monitor }) => {
      let listeners = new HookListeners({
        db,
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
    setup: ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('hooks')],
    }).generateReferences(),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      port: cfg.server.port,
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  schedulerNoStart: {
    requires: ['cfg', 'db', 'taskcreator', 'notify', 'monitor'],
    setup: ({ cfg, db, taskcreator, notify, monitor }) => {
      return new Scheduler({
        db,
        taskcreator,
        notify,
        monitor: monitor.childMonitor('scheduler'),
        pollingDelay: cfg.app.scheduler.pollingDelay,
      });
    },
  },

  scheduler: {
    requires: ['schedulerNoStart'],
    setup: ({ schedulerNoStart }) => schedulerNoStart.start(),
  },

  expires: {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Expiring lastFires rows');
        const count = (await db.fns.expire_last_fires())[0].expire_last_fires;
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

export default load;
