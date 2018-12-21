const Loader = require('taskcluster-lib-loader');
const Docs = require('taskcluster-lib-docs');
const SchemaSet = require('taskcluster-lib-validate');
const Monitor = require('taskcluster-lib-monitor');
const App = require('taskcluster-lib-app');
const {sasCredentials} = require('taskcluster-lib-azure');
const Config = require('typed-env-config');
const data = require('./data');
const containers = require('./containers');
const builder = require('./v1');
const path = require('path');
const debug = require('debug')('server');
const AWS = require('aws-sdk');
const exchanges = require('./exchanges');
const ScopeResolver = require('./scoperesolver');
const signaturevalidator = require('./signaturevalidator');
const taskcluster = require('taskcluster-client');
const url = require('url');
const SentryClient = require('sentry-api').Client;
const SentryManager = require('./sentrymanager');
const Statsum = require('statsum');
const _ = require('lodash');
const morganDebug = require('morgan-debug');
const libPulse = require('taskcluster-lib-pulse');

// Create component loader
const load = Loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => Config({profile}),
  },

  sentryClient: {
    requires: ['cfg'],
    setup: ({cfg}) => new SentryClient(`https://${cfg.app.sentry.hostname}`, {
      token: cfg.app.sentry.authToken,
    }),
  },

  sentryManager: {
    requires: ['cfg', 'sentryClient'],
    setup: ({cfg, sentryClient}) => new SentryManager({
      sentryClient,
      ...cfg.app.sentry,
    }),
  },

  monitor: {
    requires: ['cfg', 'sentryManager', 'profile', 'process'],
    setup: ({cfg, sentryManager, profile, process}) => {
      return Monitor({
        projectName: cfg.monitoring.project || 'taskcluster-auth',
        rootUrl: cfg.taskcluster.rootUrl,
        enable: cfg.monitoring.enable,
        process,
        mock: profile === 'test',
        aws: {credentials: _.pick(cfg.aws, ['accessKeyId', 'secretAccessKey']), region: cfg.aws.region},
        logName: cfg.app.auditLog, // Audit logs will be noop if this is null
        statsumToken: async (project) => {
          return {
            project,
            token:    Statsum.createToken(project, cfg.app.statsum.secret, '25h'),
            baseUrl:  cfg.app.statsum.baseUrl,
            expires:  taskcluster.fromNowJSON('24 hours'),
          };

        },
        sentryDSN: async (project) => {
          let key = await sentryManager.projectDSN(project);
          return {
            project,
            dsn: _.pick(key.dsn, ['secret', 'public']),
            expires: key.expires.toJSON(),
          };
        },
      });
    },
  },

  resolver: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
      monitor: monitor.prefix('scope-resolver'),
    }),
  },

  Client: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) =>
      data.Client.setup({
        tableName:    cfg.app.clientTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.azure.signingKey,
        cryptoKey:    cfg.azure.cryptoKey,
        monitor:      monitor.prefix('table.clients'),
      }),
  },

  Roles: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let Roles = new containers.Roles({
        credentials:  cfg.azure || {},
        containerName: cfg.app.rolesContainerName,
      });
      await Roles.setup();
      return Roles;
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'auth',
      publish:  cfg.app.publishMetaData,
      aws:      cfg.aws,
      bucket:   cfg.app.buckets.schemas,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => Docs.documenter({
      aws: cfg.aws,
      tier: 'platform',
      schemaset,
      bucket: cfg.app.buckets.docs,
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

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new libPulse.Client({
        namespace: 'taskcluster-auth',
        monitor,
        credentials: libPulse.pulseCredentials(cfg.pulse),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'schemaset', 'pulseClient'],
    setup: async ({cfg, schemaset, pulseClient}) => await exchanges.publisher({
      rootUrl:          cfg.taskcluster.rootUrl,
      client:           pulseClient,
      credentials:      cfg.pulse,
      schemaset,
      namespace:        'taskcluster-auth',
      publish:          cfg.app.publishMetaData,
      aws:              cfg.aws,
      referenceBucket:  cfg.app.buckets.references,
    }),
  },

  api: {
    requires: [
      'cfg', 'Client', 'Roles', 'schemaset', 'publisher', 'resolver',
      'sentryManager', 'monitor', 'pulseClient',
    ],
    setup: async ({
      cfg, Client, Roles, schemaset, publisher, resolver, sentryManager, monitor, pulseClient,
    }) => {
      // Set up the Azure tables
      await Client.ensureTable();

      // set up the static clients
      await Client.syncStaticClients(cfg.app.staticClients || []);

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
        monitor,
      });

      return builder.build({
        rootUrl: cfg.taskcluster.rootUrl,
        context: {
          Client, Roles,
          publisher,
          resolver,
          sts:                new AWS.STS(cfg.aws),
          azureAccounts:      cfg.app.azureAccounts,
          signatureValidator,
          sentryManager,
          statsum:            cfg.app.statsum,
          webhooktunnel:      cfg.app.webhooktunnel,
          monitor,
        },
        schemaset,
        signatureValidator,
        publish:            cfg.app.publishMetaData,
        aws:                cfg.aws,
        referenceBucket:    cfg.app.buckets.references,
        monitor:            monitor.prefix('api'),
      });
    },
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: async ({cfg, api, docs}) => App({
      apis: [api],
      ...cfg.server,
    }),
  },

  'expire-sentry': {
    requires: ['cfg', 'sentryManager', 'monitor'],
    setup: async ({cfg, sentryManager, monitor}) => {
      return monitor.oneShot('expire-sentry', async () => {
        const now = taskcluster.fromNow(cfg.app.sentryExpirationDelay);
        debug('Expiring sentry keys');
        await sentryManager.purgeExpiredKeys(now);
        debug('Expired sentry keys');
      });
    },
  },

  'purge-expired-clients': {
    requires: ['cfg', 'Client', 'monitor'],
    setup: ({cfg, Client, monitor}) => {
      return monitor.oneShot('purge-expired-clients', async () => {
        const now = taskcluster.fromNow(cfg.app.clientExpirationDelay);
        debug('Purging expired clients');
        await Client.purgeExpired(now);
        debug('PUrged expired clients');
      });
    },
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
