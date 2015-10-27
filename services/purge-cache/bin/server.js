#!/usr/bin/env node
var debug             = require('debug')('purge-cache:server');
var base              = require('taskcluster-base');
var api               = require('../lib/api');
var path              = require('path');
var Promise           = require('promise');
var exchanges         = require('../lib/exchanges');
var _                 = require('lodash');

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'purgeCache_publishMetaData',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString'
    ],
    filename:     'taskcluster-purge-cache'
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
    component:  cfg.get('purgeCache:statsComponent'),
    process:    'server'
  });

  let validator = await base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('purgeCache:publishMetaData') === 'true',
    schemaPrefix:     'purge-cache/v1/',
    aws:              cfg.get('aws')
  });

  let publisher = await exchanges.setup({
    credentials:        cfg.get('pulse'),
    exchangePrefix:     cfg.get('purgeCache:exchangePrefix'),
    validator:          validator,
    referencePrefix:    'purge-cache/v1/exchanges.json',
    publish:            cfg.get('purgeCache:publishMetaData') === 'true',
    aws:                cfg.get('aws'),
    drain:              influx,
    component:          cfg.get('purgeCache:statsComponent'),
    process:            'server'
  });

  // Create API router and publish reference if needed
  debug("Creating API router");

  let router = await api.setup({
    context:          {publisher},
    validator:        validator,
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
    publish:          cfg.get('purgeCache:publishMetaData') === 'true',
    baseUrl:          cfg.get('server:publicUrl') + '/v1',
    referencePrefix:  'purge-cache/v1/api.json',
    aws:              cfg.get('aws'),
    component:        cfg.get('purgeCache:statsComponent'),
    drain:            influx
  });

  debug("Configuring app");

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
  debug("Launching server");
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
    debug("Launched server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;