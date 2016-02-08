#!/usr/bin/env node
var base               = require('taskcluster-base');
var data               = require('../auth/data');
var v1                 = require('../auth/v1');
var path               = require('path');
var debug              = require('debug')('server');
var Promise            = require('promise');
var AWS                = require('aws-sdk-promise');
var exchanges          = require('../auth/exchanges');
var ScopeResolver      = require('../auth/scoperesolver');
var signaturevalidator = require('../auth/signaturevalidator');
var taskcluster        = require('taskcluster-client');
var url                = require('url');
var loader             = require('taskcluster-lib-loader');
var app                = require('taskcluster-lib-app');

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

  resolver: {
    requires: ['cfg'],
    setup: ({cfg}) => new ScopeResolver({
      maxLastUsedDelay: cfg.app.maxLastUsedDelay,
    })
  },

  Client: {
    requires: ['cfg', 'drain', 'resolver'],
    setup: ({cfg, drain, resolver}) =>
      data.Client.setup({
        table:        cfg.app.clientTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        cryptoKey:    cfg.app.tableCryptoKey,
        drain:        drain,
        component:    cfg.app.statsComponent,
        process:      'server',
        context:      {resolver}
      })
  },

  Role: {
    requires: ['cfg', 'drain', 'resolver'],
    setup: ({cfg, drain, resolver}) => 
      data.Role.setup({
        table:        cfg.app.rolesTableName,
        credentials:  cfg.azure || {},
        signingKey:   cfg.app.tableSigningKey,
        drain:        drain,
        component:    cfg.app.statsComponent,
        process:      'server',
        context:      {resolver}
      })
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) =>
      base.validator({
        folder:           path.join(__dirname, '..', 'schemas'),
        constants:        require('../schemas/constants'),
        publish:          cfg.app.publishMetaData,
        schemaPrefix:     'auth/v1/',
        aws:              cfg.aws
      })
  },

  publisher: {
    requires: ['cfg', 'validator', 'drain'],
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
        process:          'server'
      })
  },

  api: {
    requires: ['cfg', 'Client', 'Role', 'validator', 'publisher', 'resolver', 'drain'],
    setup: async ({cfg, Client, Role, validator, publisher, resolver, drain}) => {
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
        },
        validator,
        signatureValidator,
        publish:            cfg.app.publishMetaData,
        baseUrl:            cfg.server.publicUrl + '/v1',
        referencePrefix:    'auth/v1/api.json',
        aws:                cfg.aws,
        component:          cfg.app.statsComponent,
        drain:              drain
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
}, ['profile']);

// If server.js is executed start the server
if (!module.parent) {
  load('server', {
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
