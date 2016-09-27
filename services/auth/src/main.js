let Loader             = require('taskcluster-lib-loader');
let Validate           = require('taskcluster-lib-validate');
let Monitor            = require('taskcluster-lib-monitor');
let App                = require('taskcluster-lib-app');
let Config             = require('typed-env-config');
let data               = require('./data');
let v1                 = require('./v1');
let path               = require('path');
let debug              = require('debug')('server');
let Promise            = require('promise');
let AWS                = require('aws-sdk-promise');
let exchanges          = require('./exchanges');
let ScopeResolver      = require('./scoperesolver');
let signaturevalidator = require('./signaturevalidator');
let taskcluster        = require('taskcluster-client');
let url                = require('url');
let SentryManager      = require('./sentrymanager');
let Statsum            = require('statsum');
let _                  = require('lodash');

// Create component loader
let load = Loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => Config({profile}),
  },

  sentryManager: {
    requires: ['cfg'],
    setup: ({cfg}) => new SentryManager(cfg.app.sentry),
  },

  monitor: {
    requires: ['cfg', 'sentryManager', 'profile', 'process'],
    setup: ({cfg, sentryManager, profile, process}) => {
      return Monitor({
        project: 'taskcluster-auth',
        process,
        mock: profile === 'test',
        statsumToken: async (project) => {
          return {
            project,
            token:    Statsum.createToken(project, cfg.app.statsum.secret, '25h'),
            baseUrl:  cfg.app.statsum.baseUrl,
            expires:  taskcluster.fromNowJSON('24 hours'),
          };

        },
        sentryDSN: async (project) => {
          let key = await this.sentryManager.projectDSN(project);
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
    requires: ['cfg'],
    setup: ({cfg}) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
    })
  },

  Client: {
    requires: ['cfg', 'resolver', 'monitor'],
    setup: ({cfg, resolver, monitor}) =>
      data.Client.setup({
        table:        cfg.app.clientTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        cryptoKey:    cfg.app.tableCryptoKey,
        context:      {resolver},
        monitor:      monitor.prefix('table.clients'),
      })
  },

  Role: {
    requires: ['cfg', 'resolver', 'monitor'],
    setup: ({cfg, resolver, monitor}) =>
      data.Role.setup({
        table:        cfg.app.rolesTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        context:      {resolver},
        monitor:      monitor.prefix('table.roles'),
      })
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => Validate({
      prefix:  'auth/v1/',
      aws:      cfg.aws
    })
  },

  publisher: {
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) =>
      exchanges.setup({
        credentials:      cfg.pulse,
        exchangePrefix:   cfg.app.exchangePrefix,
        validator:        validator,
        referencePrefix:  'auth/v1/exchanges.json',
        publish:          cfg.app.publishMetaData,
        aws:              cfg.aws,
        monitor:          monitor.prefix('publisher'),
      })
  },

  api: {
    requires: [
      'cfg', 'Client', 'Role', 'validator', 'publisher', 'resolver',
      'sentryManager', 'monitor',
    ],
    setup: async ({
      cfg, Client, Role, validator, publisher, resolver, sentryManager, monitor
    }) => {
      // Set up the Azure tables
      await Role.ensureTable();
      await Client.ensureTable();

      // set up the root access token if necessary
      if (cfg.app.rootAccessToken) {
        await Client.ensureRootClient(cfg.app.rootAccessToken);
      }

      // Load everything for resolver
      await resolver.setup({
        Client, Role,
        exchangeReference: exchanges.reference({
          credentials:      cfg.pulse,
          exchangePrefix:   cfg.app.exchangePrefix,
        }),
        connection: new taskcluster.PulseConnection(cfg.pulse)
      });

      let signatureValidator = signaturevalidator.createSignatureValidator({
        expandScopes: (scopes) => resolver.resolve(scopes),
        clientLoader: (clientId) => resolver.loadClient(clientId),
      });

      return v1.setup({
        context: {
          Client, Role,
          publisher,
          resolver,
          sts:                new AWS.STS(cfg.aws),
          azureAccounts:      cfg.app.azureAccounts,
          signatureValidator,
          sentryManager,
          statsum:            cfg.app.statsum,
        },
        validator,
        signatureValidator,
        publish:            cfg.app.publishMetaData,
        baseUrl:            cfg.server.publicUrl + '/v1',
        referencePrefix:    'auth/v1/api.json',
        aws:                cfg.aws,
        monitor:            monitor.prefix('api'),
      });
    }
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({cfg, api}) => {
      // Create app
      let serverApp = App(cfg.server);

      serverApp.use('/v1', api);

      serverApp.get('/', (req, res) => {
        res.redirect(302, url.format({
          protocol:       'https',
          host:           'login.taskcluster.net',
          query: {
            target:       req.query.target,
            description:  req.query.description
          }
        }));
      });

      // Create server
      return serverApp.createServer();
    }
  },

  'expire-sentry': {
    requires: ['cfg', 'sentryManager'],
    setup: async ({cfg, sentryManager}) => {
      let now = taskcluster.fromNow(cfg.app.sentryExpirationDelay);
      if (isNaN(now)) {
        console.log("FATAL: sentryExpirationDelay is not valid!");
        process.exit(1);
      }
      await sentryManager.purgeExpiredKeys(now);
    }
  }
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
