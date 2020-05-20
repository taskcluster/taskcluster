require('../../prelude');
const Loader = require('taskcluster-lib-loader');
const SchemaSet = require('taskcluster-lib-validate');
const libReferences = require('taskcluster-lib-references');
const tcdb = require('taskcluster-db');
const {MonitorManager} = require('taskcluster-lib-monitor');
const {App} = require('taskcluster-lib-app');
const Config = require('taskcluster-lib-config');
const data = require('./data');
const builder = require('./api');
const debug = require('debug')('server');
const exchanges = require('./exchanges');
const ScopeResolver = require('./scoperesolver');
const signaturevalidator = require('./signaturevalidator');
const taskcluster = require('taskcluster-client');
const makeSentryManager = require('./sentrymanager');
const libPulse = require('taskcluster-lib-pulse');
const {google: googleapis} = require('googleapis');
const assert = require('assert');

// Create component loader
const load = Loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => Config({
      profile,
      serviceName: 'auth',
    }),
  },

  sentryManager: {
    requires: ['cfg'],
    setup: ({cfg}) => makeSentryManager({...cfg.app.sentry}),
  },

  monitor: {
    requires: ['cfg', 'profile', 'process'],
    setup: ({cfg, profile, process}) => MonitorManager.setup({
      serviceName: 'auth',
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  resolver: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
      monitor: monitor.childMonitor('scope-resolver'),
    }),
  },

  db: {
    requires: ['cfg', 'process', 'monitor'],
    setup: ({cfg, process, monitor}) => tcdb.setup({
      readDbUrl: cfg.postgres.readDbUrl,
      writeDbUrl: cfg.postgres.writeDbUrl,
      serviceName: 'auth',
      monitor: monitor.childMonitor('db'),
      statementTimeout: process === 'server' ? 30000 : 0,
    }),
  },

  Client: {
    requires: ['cfg', 'monitor', 'db'],
    setup: ({cfg, monitor, db}) =>
      data.Client.setup({
        db,
        serviceName: 'auth',
        tableName: cfg.app.clientTableName,
        signingKey: cfg.azure.signingKey,
        cryptoKey: cfg.azure.cryptoKey,
        monitor: monitor.childMonitor('table.clients'),
      }),
  },

  Roles: {
    requires: ['cfg', 'monitor', 'db'],
    setup: async ({cfg, monitor, db}) => {
      return data.Roles.setup({
        db,
        serviceName: 'auth',
        tableName: cfg.app.rolesContainerName,
        monitor: monitor.childMonitor('table.roles'),
      });
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'auth',
    }),
  },

  generateReferences: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => libReferences.fromService({
      schemaset,
      references: [builder.reference(), exchanges.reference(), MonitorManager.reference('auth')],
    }).generateReferences(),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new libPulse.Client({
        namespace: 'taskcluster-auth',
        monitor: monitor.childMonitor('pulse-client'),
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({cfg, schemaset, pulseClient}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
      namespace: 'taskcluster-auth',
    }),
  },

  api: {
    requires: [
      'cfg', 'Client', 'Roles', 'schemaset', 'publisher', 'resolver',
      'sentryManager', 'monitor', 'pulseClient', 'gcp',
    ],
    setup: async ({
      cfg, Client, Roles, schemaset, publisher, resolver, sentryManager,
      monitor, pulseClient, gcp,
    }) => {
      // Set up the Azure tables
      await Client.ensureTable();

      // set up the static clients
      await Client.syncStaticClients(cfg.app.staticClients || [], cfg.azure.accountId);

      // Load everything for resolver
      await resolver.setup({
        rootUrl: cfg.taskcluster.rootUrl,
        Client, Roles,
        exchangeReference: exchanges.reference(),
        pulseClient,
      });

      let signatureValidator = signaturevalidator.createSignatureValidator({
        expandScopes: (scopes) => resolver.resolve(scopes),
        clientLoader: (clientId) => resolver.loadClient(clientId),
        monitor: monitor.childMonitor('signature-validator'),
      });

      return builder.build({
        rootUrl: cfg.taskcluster.rootUrl,
        context: {
          Client, Roles,
          publisher,
          resolver,
          cfg,
          azureAccounts: cfg.app.azureAccounts,
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
    setup: ({api}) => [api],
  },

  server: {
    requires: ['cfg', 'apis'],
    setup: async ({cfg, apis}) => App({
      apis,
      ...cfg.server,
    }),
  },

  gcp: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      const projects = cfg.gcpCredentials.allowedProjects || {};
      const projectIds = Object.keys(projects);

      // NOTE: this is a temporary limit to avoid more massive refactoring, while
      // supporting a future-compatible configuration format.  There's no other, hidden
      // reason for this limitation.
      assert(projectIds.length <= 1, "at most one GCP project is supported");

      if (projectIds.length === 0) {
        return {googleapis, auth: {}, credentials: {}, allowedServiceAccounts: []};
      }

      const project = projects[projectIds[0]];
      const {credentials, allowedServiceAccounts} = project;
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
    setup: async ({cfg, sentryManager, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.sentryExpirationDelay);
        debug('Expiring sentry keys');
        await sentryManager.purgeExpiredKeys(now);
        debug('Expired sentry keys');
      });
    },
  },

  'purge-expired-clients': {
    requires: ['cfg', 'Client', 'monitor'],
    setup: ({cfg, Client, monitor}, ownName) => {
      return monitor.oneShot(ownName, async () => {
        const now = taskcluster.fromNow(cfg.app.clientExpirationDelay);
        debug('Purging expired clients');
        await Client.purgeExpired(now);
        debug('Purged expired clients');
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
