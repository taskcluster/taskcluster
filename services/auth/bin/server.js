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


/** Launch server */
var launch = async function(profile) {
  // Load configuration
  var cfg = base.config({
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
  });

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx({
    connectionString:   cfg.get('influx:connectionString'),
    maxDelay:           cfg.get('influx:maxDelay'),
    maxPendingPoints:   cfg.get('influx:maxPendingPoints')
  });

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      influx,
    component:  cfg.get('auth:statsComponent'),
    process:    'server'
  });

  // Create resolver
  var resolver = new ScopeResolver({
    maxLastUsedDelay: cfg.get('auth:maxLastUsedDelay'),
  });

  // Configure client table
  var Client = data.Client.setup({
    table:        cfg.get('auth:clientTableName'),
    credentials:  cfg.get('azure'),
    signingKey:   cfg.get('auth:tableSigningKey'),
    cryptoKey:    cfg.get('auth:tableCryptoKey'),
    drain:        influx,
    component:    cfg.get('auth:statsComponent'),
    process:      'server',
    context:      {resolver}
  });

  // Configure role table
  var Role = data.Role.setup({
    table:        cfg.get('auth:rolesTableName'),
    credentials:  cfg.get('azure'),
    signingKey:   cfg.get('auth:tableSigningKey'),
    drain:        influx,
    component:    cfg.get('auth:statsComponent'),
    process:      'server',
    context:      {resolver}
  });

  // Initialize validator and publish schemas if needed
  var validator, publisher;
  await Promise.all([
    (async () => {
      validator = await base.validator({
        folder:           path.join(__dirname, '..', 'schemas'),
        constants:        require('../schemas/constants'),
        publish:          cfg.get('auth:publishMetaData') === 'true',
        schemaPrefix:     'auth/v1/',
        aws:              cfg.get('aws')
      });

      publisher = await exchanges.setup({
        credentials:      cfg.get('pulse'),
        exchangePrefix:   cfg.get('auth:exchangePrefix'),
        validator:        validator,
        referencePrefix:  'auth/v1/exchanges.json',
        publish:          cfg.get('auth:publishMetaData') === 'true',
        aws:              cfg.get('aws'),
        drain:            influx,
        component:        cfg.get('auth:statsComponent'),
        process:          'server'
      });
    })(),
    (async () => {
      // Ensure tables exist
      await Promise.all([
        Client.ensureTable(),
        Role.ensureTable()
      ]);

      if (cfg.get('auth:rootAccessToken')) {
        await Client.ensureRootClient(cfg.get('auth:rootAccessToken'));
        await Role.ensureRootRole();
      }
    })()
  ]);

  // Load everything for resolver
  await resolver.setup({
    Client, Role,
    exchangeReference: exchanges.reference({
      credentials:      cfg.get('pulse'),
      exchangePrefix:   cfg.get('auth:exchangePrefix')
    }),
    connection: new taskcluster.PulseConnection(cfg.get('pulse'))
  });

  // Create signature validator
  var signatureValidator = resolver.createSignatureValidator();

  // Create API router and publish reference if needed
  var router = await v1.setup({
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
    drain:              influx
  });

  // Create app
  var app = base.app({
    port:           Number(process.env.PORT || cfg.get('server:port')),
    env:            cfg.get('server:env'),
    forceSSL:       cfg.get('server:forceSSL'),
    trustProxy:     cfg.get('server:trustProxy')
  });

  // Mount API router
  app.use('/v1', router);

  app.get('/', (req, res) => {
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
  return app.createServer();
};

// If server.js is executed start the server
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: server.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched authentication server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;