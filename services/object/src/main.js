import '../../prelude.js';
import tcdb from 'taskcluster-db';
import builder from '../src/api.js';
import loader from 'taskcluster-lib-loader';
import SchemaSet from 'taskcluster-lib-validate';
import { MonitorManager } from 'taskcluster-lib-monitor';
import { App } from 'taskcluster-lib-app';
import libReferences from 'taskcluster-lib-references';
import config from 'taskcluster-lib-config';
import { Backends } from './backends/index.js';
import { Middleware } from './middleware/index.js';
import expireObjects from './expire.js';
import { fileURLToPath } from 'url';

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => config({
      profile,
      serviceName: 'object',
    }),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({ process, profile, cfg }) => MonitorManager.setup({
      serviceName: 'object',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'object',
    }),
  },

  db: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      dbCryptoKeys: cfg.postgres.dbCryptoKeys,
      serviceName: 'object',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: async ({ cfg, schemaset }) => (await libReferences.fromService({
      schemaset,
      references: [builder.reference(), MonitorManager.reference('object')],
    })).generateReferences(),
  },

  backends: {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }) => new Backends().setup({ cfg, db, monitor }),
  },

  middleware: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => new Middleware().setup({ cfg, monitor }),
  },

  api: {
    requires: ['cfg', 'db', 'schemaset', 'monitor', 'backends', 'middleware'],
    setup: async ({ cfg, db, schemaset, monitor, backends, middleware }) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: { cfg, db, backends, middleware },
      monitor: monitor.childMonitor('api'),
      schemaset,
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({ cfg, api }) => App({
      port: Number(process.env.PORT || cfg.server.port),
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      keepAliveTimeoutSeconds: cfg.server.keepAliveTimeoutSeconds,
      apis: [api],
    }),
  },

  expire: {
    requires: ['db', 'monitor', 'backends'],
    setup: ({ db, monitor, backends }) =>
      monitor.oneShot('expireObjects', () => expireObjects({ db, monitor, backends })),
  },
}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
