#!/usr/bin/env node
var base          = require('taskcluster-base');
var data          = require('../auth/data');
var v1            = require('../auth/v1');
var path          = require('path');
var debug         = require('debug')('server');
var Promise       = require('promise');
var AWS           = require('aws-sdk-promise');
var exchanges     = require('../auth/exchanges');
var ScopeResolver = require('../auth/scoperesolver');
var taskcluster   = require('taskcluster-client');
var url           = require('url');
var loader        = require('taskcluster-lib-loader');
var app           = require('taskcluster-lib-app');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => {
      return base.config({
        defaults:     require('../config/defaults'),
        profile:      require('../config/' + profile),
        envs: [
          'auth_tableSigningKey',
          'auth_tableCryptoKey',
          'auth_publishMetaData',
          'server_publicUrl',
          'server_cookieSecret',
          'azure_accountName',
          'azure_accountKey',
          'pulse_username',
          'pulse_password',
          'aws_accessKeyId',
          'aws_secretAccessKey',
          'influx_connectionString',
          'auth_rootAccessToken',
          'auth_azureAccounts'
        ],
        filename:     'taskcluster-auth'
      })
    },
  },

  drain: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      if (cfg.get('influx:connectionString')) {
        return new base.stats.Influx({
          connectionString:   cfg.get('influx:connectionString'),
          maxDelay:           cfg.get('influx:maxDelay'),
          maxPendingPoints:   cfg.get('influx:maxPendingPoints')
        });
      }
      return new base.stats.NullDrain();
    }
  },

  monitor: {
    requires: ['cfg', 'drain'],
    setup: ({cfg, drain}) => base.stats.startProcessUsageReporting({
      drain:      drain,
      component:  cfg.get('auth:statsComponent'),
      process:    'server'
    })
  },

  resolver: {
    requires: ['cfg'],
    setup: ({cfg}) => new ScopeResolver({
      maxLastUsedDelay: cfg.get('auth:maxLastUsedDelay'),
    })
  },

  Client: {
    requires: ['cfg', 'drain', 'resolver'],
    setup: ({cfg, drain, resolver}) =>
      data.Client.setup({
        table:        cfg.get('auth:clientTableName'),
        credentials:  cfg.get('azure'),
        signingKey:   cfg.get('auth:tableSigningKey'),
        cryptoKey:    cfg.get('auth:tableCryptoKey'),
        drain:        drain,
        component:    cfg.get('auth:statsComponent'),
        process:      'server',
        context:      {resolver}
      })
  },

  Role: {
    requires: ['cfg', 'drain', 'resolver'],
    setup: ({cfg, drain, resolver}) => 
      data.Role.setup({
        table:        cfg.get('auth:rolesTableName'),
        credentials:  cfg.get('azure'),
        signingKey:   cfg.get('auth:tableSigningKey'),
        drain:        drain,
        component:    cfg.get('auth:statsComponent'),
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
        publish:          cfg.get('auth:publishMetaData') === 'true',
        schemaPrefix:     'auth/v1/',
        aws:              cfg.get('aws')
      })
  },

  publisher: {
    requires: ['cfg', 'validator', 'drain'],
    setup: ({cfg, validator, drain, process}) =>
      exchanges.setup({
        credentials:      cfg.get('pulse'),
        exchangePrefix:   cfg.get('auth:exchangePrefix'),
        validator:        validator,
        referencePrefix:  'auth/v1/exchanges.json',
        publish:          cfg.get('auth:publishMetaData') === 'true',
        aws:              cfg.get('aws'),
        drain:            drain,
        component:        cfg.get('auth:statsComponent'),
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
      if (cfg.get('auth:rootAccessToken')) {
        await Client.ensureRootClient(cfg.get('auth:rootAccessToken'));
      }

      // Load everything for resolver
      await resolver.setup({
        Client, Role,
        exchangeReference: exchanges.reference({
          credentials:      cfg.get('pulse'),
          exchangePrefix:   cfg.get('auth:exchangePrefix')
        }),
        connection: new taskcluster.PulseConnection(cfg.get('pulse'))
      });

      let signatureValidator = resolver.createSignatureValidator()

      return v1.setup({
        context: {
          Client, Role,
          publisher,
          resolver,
          sts:                new AWS.STS(cfg.get('aws')),
          azureAccounts:      JSON.parse(cfg.get('auth:azureAccounts')),
          signatureValidator,
        },
        validator,
        signatureValidator,
        publish:            cfg.get('auth:publishMetaData') === 'true',
        baseUrl:            cfg.get('server:publicUrl') + '/v1',
        referencePrefix:    'auth/v1/api.json',
        aws:                cfg.get('aws'),
        component:          cfg.get('auth:statsComponent'),
        drain:              drain
      })
    }
  },

  server: {
    requires: ['cfg', 'api'],
    setup: async ({cfg, api}) => {
      // Create app
      let serverApp = app({
        port:           Number(process.env.PORT || cfg.get('server:port')),
        env:            cfg.get('server:env'),
        forceSSL:       cfg.get('server:forceSSL'),
        trustProxy:     cfg.get('server:trustProxy')
      });

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
    profile: process.argv[2]
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
