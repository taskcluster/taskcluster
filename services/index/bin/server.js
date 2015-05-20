#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('index:bin:server');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var data        = require('../index/data');
var v1          = require('../routes/api/v1');

/** Launch server */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'index_publishMetaData',
      'taskcluster_queueBaseUrl',
      'taskcluster_authBaseUrl',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'index_azureAccount',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString'
    ],
    filename:     'taskcluster-index'
  });

  // Configure IndexedTask and Namespace entities
  var IndexedTask = data.IndexedTask.setup({
    account:          cfg.get('index:azureAccount'),
    table:            cfg.get('index:indexedTaskTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });
  var Namespace = data.Namespace.setup({
    account:          cfg.get('index:azureAccount'),
    table:            cfg.get('index:namespaceTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });

  // Create a validator
  var validator = null;
  var validatorCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('index:publishMetaData') === 'true',
    schemaPrefix:     'index/v1/',
    aws:              cfg.get('aws')
  }).then(function(validator_) {
    validator = validator_;
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
    component:  cfg.get('index:statsComponent'),
    process:    'server'
  });

  // When: validator is created, proceed
  return validatorCreated.then(function() {
    // Create API router and publish reference if needed
    return v1.setup({
      context: {
        queue:          new taskcluster.Queue({
          credentials:  cfg.get('taskcluster:credentials'),
          baseUrl:      cfg.get('taskcluster:queueBaseUrl')
        }),
        validator:      validator,
        IndexedTask:    IndexedTask,
        Namespace:      Namespace
      },
      validator:        validator,
      authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
      credentials:      cfg.get('taskcluster:credentials'),
      publish:          cfg.get('index:publishMetaData') === 'true',
      baseUrl:          cfg.get('server:publicUrl') + '/v1',
      referencePrefix:  'index/v1/api.json',
      aws:              cfg.get('aws'),
      component:        cfg.get('index:statsComponent'),
      drain:            influx
    });
  }).then(function(router) {
    // Create app
    var app = base.app({
      port:           Number(process.env.PORT || cfg.get('server:port')),
      env:            cfg.get('server:env'),
      forceSSL:       cfg.get('server:forceSSL'),
      trustProxy:     cfg.get('server:trustProxy')
    });

    // Mount API router
    app.use('/v1', router);

    // Create server
    return app.createServer();
  });
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
    debug("Launched server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;