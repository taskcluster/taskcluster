import '../../prelude.js';
import Loader from 'taskcluster-lib-loader';
import SchemaSet from 'taskcluster-lib-validate';
import libReferences from 'taskcluster-lib-references';
import tcdb from 'taskcluster-db';
import { MonitorManager } from 'taskcluster-lib-monitor';
import { App } from 'taskcluster-lib-app';
import Config from 'taskcluster-lib-config';
import builder from './api.js';
import debugFactory from 'debug';
const debug = debugFactory('server');
import exchanges from './exchanges.js';
import ScopeResolver from './scoperesolver.js';
import createSignatureValidator from './signaturevalidator.js';
import taskcluster from 'taskcluster-client';
import makeSentryManager from './sentrymanager.js';
import * as libPulse from 'taskcluster-lib-pulse';
import { google as googleapis } from 'googleapis';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { syncStaticClients } from './static-clients.js';

// Create component loader
const load = Loader({
  cfg: {
    requires: ['profile'],
    setup: ({ profile }) => Config({
      profile,
      serviceName: 'auth',
    }),
  },

  sentryManager: {
    requires: ['cfg'],
    setup: ({ cfg }) => makeSentryManager({ ...cfg.app.sentry }),
  },

  monitor: {
    requires: ['cfg', 'profile', 'process'],
    setup: ({ cfg, profile, process }) => MonitorManager.setup({
      serviceName: 'auth',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  resolver: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({ cfg, monitor, db }) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
      monitor: monitor.childMonitor('scope-resolver'),
      db,
    }),
  },

  db: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({ cfg, process, monitor }) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'auth',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
      azureCryptoKey: cfg.azure.cryptoKey,
      dbCryptoKeys: cfg.postgres.dbCryptoKeys,
    }),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({ cfg }) => new SchemaSet({
      serviceName: 'auth',
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({ cfg, schemaset }) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('auth')],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({ cfg, monitor }) => {
      return new libPulse.Client({
        namespace: 'taskcluster-auth',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({ cfg, schemaset, pulseClient }) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
      namespace: 'taskcluster-auth',
    }),
  },

  api: {
    requires: [
      'cfg', 'db', 'schemaset', 'publisher', 'resolver',
      'sentryManager', 'monitor', 'pulseClient', 'gcp',
    ],
    setup: async ({
      cfg, db, schemaset, publisher, resolver, sentryManager,
      monitor, pulseClient, gcp,
    }) => {
      // set up the static clients
      await syncStaticClients(db, cfg.app.staticClients || []);

      // Load everything for resolver
      await resolver.setup({
        rootUrl: cfg.taskcluster.rootUrl,
        exchangeReference: exchanges.reference(),
        pulseClient,
      });

      let signatureValidator = createSignatureValidator({
        expandScopes: (scopes) => resolver.resolve(scopes),
        clientLoader: (clientId) => resolver.loadClient(clientId),
        monitor: monitor.childMonitor('signature-validator'),
      });

      return builder.build({
        rootUrl: cfg.taskcluster.rootUrl,
        context: {
          db,
          publisher,
          resolver,
          cfg,
          signatureValidator,
          sentryManager,
          websocktunnel: cfg.app.websocktunnel,
          gcp,
        },
        schemaset,
        signatureValidator,
        monitor: monitor.childMonitor('api'),
      });
    },
  },

  // tests use this to inject other APIs.
  apis: {
    requires: ['api'],
    setup: ({ api }) => [api],
  },

  server: {
    requires: ['cfg', 'apis'],
    setup: async ({ cfg, apis }) => App({
      apis,
      ...cfg.server,
    }),
  },

  gcp: {
    requires: ['cfg'],
    setup: ({ cfg }) => {
      const projects = cfg.gcpCredentials.allowedProjects || {};
      const projectIds = Object.keys(projects);

      // NOTE: this is a temporary limit to avoid more massive refactoring, while
      // supporting a future-compatible configuration format.  There's no other, hidden
      // reason for this limitation.
      assert(projectIds.length <= 1, "at most one GCP project is supported");

      if (projectIds.length === 0) {
        return { googleapis, auth: {}, credentials: {}, allowedServiceAccounts: [] };
      }

      const project = projects[projectIds[0]];
      const { credentials, allowedServiceAccounts } = project;
      assert.equal(projectIds[0], credentials.project_id, "credentials must be for the given project");

      assert(Array.isArray(allowedServiceAccounts));

      // note that this service can currently start up correctly without GCP
      // credentials configured.
      const auth = credentials ? googleapis.auth.fromJSON(credentials) : {};

      auth.scopes = [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/iam',
      ];

      // return an object with..
      return {
        // the googleapis module (useful for dependency injection in tests)
        googleapis,
        // the constructed auth object
        auth,
        // and the credentials configuration
        credentials,
        // service accounts we allow to generate temporary credentials from
        allowedServiceAccounts,
      };
    },
  },

  'expire-sentry': {
    requires: ['cfg', 'sentryManager', 'monitor'],
    setup: async ({ cfg, sentryManager, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.sentryExpirationDelay);
        debug('Expiring sentry keys');
        await sentryManager.purgeExpiredKeys(now);
        debug('Expired sentry keys');
      });
    },
  },

  'purge-expired-clients': {
    requires: ['cfg', 'db', 'monitor'],
    setup: ({ cfg, db, monitor }, ownName) => {
      return monitor.oneShot(ownName, async () => {
        debug('Purging expired clients');
        const [{ expire_clients: count }] = await db.fns.expire_clients();
        debug(`Purged ${count} expired clients`);
      });
    },
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
