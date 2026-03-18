import '../../prelude.js';
import { fileURLToPath } from 'node:url';
import tcdb from '@taskcluster/db';
import { App } from '@taskcluster/lib-app';
import config from '@taskcluster/lib-config';
import loader from '@taskcluster/lib-loader';
import { MonitorManager } from '@taskcluster/lib-monitor';
import libReferences from '@taskcluster/lib-references';
import SchemaSet from '@taskcluster/lib-validate';
import Debug from 'debug';
import builder, { AUDIT_ENTRY_TYPE } from '../src/api.js';

const debug = Debug('secrets:server');

const load = loader(
  {
    cfg: {
      requires: ['profile'],
      setup: ({ profile }) =>
        config({
          profile,
          serviceName: 'secrets',
        }),
    },

    monitor: {
      requires: ['process', 'profile', 'cfg'],
      setup: ({ process, profile, cfg }) =>
        MonitorManager.setup({
          serviceName: 'secrets',
          processName: process,
          verify: profile !== 'production',
          ...cfg.monitoring,
        }),
    },

    schemaset: {
      requires: ['cfg'],
      setup: ({ cfg }) =>
        new SchemaSet({
          serviceName: 'secrets',
        }),
    },

    db: {
      requires: ['cfg', 'process', 'monitor'],
      setup: ({ cfg, process, monitor }) =>
        tcdb.setup({
          readDbUrl: cfg.postgres.readDbUrl,
          writeDbUrl: cfg.postgres.writeDbUrl,
          azureCryptoKey: cfg.azure.cryptoKey,
          dbCryptoKeys: cfg.postgres.dbCryptoKeys,
          serviceName: 'secrets',
          monitor: monitor.childMonitor('db'),
          statementTimeout: process === 'server' ? 30000 : 0,
        }),
    },

    generateReferences: {
      requires: ['cfg', 'schemaset'],
      setup: async ({ cfg, schemaset }) =>
        libReferences
          .fromService({
            schemaset,
            references: [
              builder.reference(),
              MonitorManager.reference('secrets'),
              MonitorManager.metricsReference('secrets'),
            ],
          })
          .then((ref) => ref.generateReferences()),
    },

    api: {
      requires: ['cfg', 'db', 'schemaset', 'monitor'],
      setup: async ({ cfg, db, schemaset, monitor }) => {
        const api = builder.build({
          rootUrl: cfg.taskcluster.rootUrl,
          context: {
            cfg,
            db,
            monitor: monitor.childMonitor('api-context'),
          },
          monitor: monitor.childMonitor('api'),
          schemaset,
        });

        monitor.exposeMetrics('default');
        return api;
      },
    },

    server: {
      requires: ['cfg', 'api'],
      setup: ({ cfg, api }) =>
        App({
          port: Number(process.env.PORT || cfg.server.port),
          env: cfg.server.env,
          forceSSL: cfg.server.forceSSL,
          trustProxy: cfg.server.trustProxy,
          keepAliveTimeoutSeconds: cfg.server.keepAliveTimeoutSeconds,
          apis: [api],
        }),
    },

    expire: {
      requires: ['cfg', 'db', 'monitor'],
      setup: ({ cfg, db, monitor }, ownName) => {
        return monitor.oneShot(ownName, async () => {
          debug('Expiring secrets');
          const records = await db.fns.expire_secrets_return_names();
          debug(`Expired ${records.length} secrets`);

          const clientId = 'static/taskcluster/secrets';
          for (const { name } of records) {
            monitor.log.auditEvent({
              service: 'secrets',
              entity: 'secret',
              entityId: name,
              clientId,
              action: AUDIT_ENTRY_TYPE.SECRET.EXPIRED,
            });

            await db.fns.insert_secrets_audit_history(name, clientId, AUDIT_ENTRY_TYPE.SECRET.EXPIRED);
          }
        });
      },
    },
  },
  {
    profile: process.env.NODE_ENV,
    process: process.argv[2],
  },
);

// If this file is executed launch component from first argument
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  load.crashOnError(process.argv[2]);
}

export default load;
