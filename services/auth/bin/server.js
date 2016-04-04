#!/usr/bin/env node
let base               = require('taskcluster-base');
let data               = require('../auth/data');
let v1                 = require('../auth/v1');
let path               = require('path');
let debug              = require('debug')('server');
let Promise            = require('promise');
let AWS                = require('aws-sdk-promise');
let raven              = require('raven');
let exchanges          = require('../auth/exchanges');
let ScopeResolver      = require('../auth/scoperesolver');
let signaturevalidator = require('../auth/signaturevalidator');
let taskcluster        = require('taskcluster-client');
let url                = require('url');
let validate           = require('taskcluster-lib-validate');
let loader             = require('taskcluster-lib-loader');
let app                = require('taskcluster-lib-app');
let SentryManager      = require('../auth/sentrymanager');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  drain: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.influx && cfg.influx.connectionString) {
        return new base.stats.Influx(cfg.influx);
      }
      return new base.stats.NullDrain();
    }
  },

  monitor: {
    requires: ['cfg', 'drain'],
    setup: ({cfg, drain}) => base.stats.startProcessUsageReporting({
      drain:      drain,
      component:  cfg.app.statsComponent,
      process:    'server'
    })
  },

  raven: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.raven.sentryDSN) {
        return new raven.Client(cfg.raven.sentryDSN);
      }
      return null;
    }
  },

  sentryManager: {
    requires: ['cfg'],
    setup: ({cfg}) => new SentryManager(cfg.app.sentry),
  },

  resolver: {
    requires: ['cfg'],
    setup: ({cfg}) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
    })
  },

  Client: {
    requires: ['cfg', 'drain', 'resolver', 'process'],
    setup: ({cfg, drain, resolver, process}) =>
      data.Client.setup({
        table:        cfg.app.clientTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        cryptoKey:    cfg.app.tableCryptoKey,
        drain:        drain,
        component:    cfg.app.statsComponent,
        process,
        context:      {resolver}
      })
  },

  Role: {
    requires: ['cfg', 'drain', 'resolver', 'process'],
    setup: ({cfg, drain, resolver, process}) =>
      data.Role.setup({
        table:        cfg.app.rolesTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        drain:        drain,
        component:    cfg.app.statsComponent,
        process,
        context:      {resolver}
      })
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validate({
      prefix:  'auth/v1/',
      aws:      cfg.aws
    })
  },

  publisher: {
    requires: ['cfg', 'validator', 'drain', 'process'],
    setup: ({cfg, validator, drain, process}) =>
      exchanges.setup({
        credentials:      cfg.pulse,
        exchangePrefix:   cfg.app.exchangePrefix,
        validator:        validator,
        referencePrefix:  'auth/v1/exchanges.json',
        publish:          cfg.app.publishMetaData,
        aws:              cfg.aws,
        drain:            drain,
        component:        cfg.app.statsComponent,
        process,
      })
  },

  api: {
    requires: [
      'cfg', 'Client', 'Role', 'validator', 'publisher', 'resolver',
      'drain', 'raven', 'sentryManager'
    ],
    setup: async ({
      cfg, Client, Role, validator, publisher, resolver, drain, raven,
      sentryManager
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
        component:          cfg.app.statsComponent,
        drain:              drain,
        raven:              raven
      })
    }
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({cfg, api}) => {
      // Create app
      let serverApp = app(cfg.server);

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
