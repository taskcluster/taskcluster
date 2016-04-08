#!/usr/bin/env node
var debug             = require('debug')('purge-cache:server');
var base              = require('taskcluster-base');
var api               = require('./api');
var path              = require('path');
var Promise           = require('promise');
var exchanges         = require('./exchanges');
var _                 = require('lodash');

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({profile});

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx({
    connectionString:   cfg.influx.connectionString,
    maxDelay:           cfg.influx.maxDelay,
    maxPendingPoints:   cfg.influx.maxPendingPoints,
  });

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      influx,
    component:  cfg.purgeCache.statsComponent,
    process:    'server',
  });

  let validator = await base.validator({
    prefix: 'purge-cache/v1/',
    aws:     cfg.aws,
  });

  let publisher = await exchanges.setup({
    credentials:        cfg.pulse,
    exchangePrefix:     cfg.purgeCache.exchangePrefix,
    validator:          validator,
    referencePrefix:    'purge-cache/v1/exchanges.json',
    publish:            cfg.purgeCache.publishMetaData,
    aws:                cfg.aws,
    drain:              influx,
    component:          cfg.purgeCache.statsComponent,
    process:            'server',
  });

  // Create API router and publish reference if needed
  debug("Creating API router");

  let router = await api.setup({
    context:          {publisher},
    validator:        validator,
    publish:          cfg.purgeCache.publishMetaData,
    baseUrl:          cfg.server.publicUrl + '/v1',
    referencePrefix:  'purge-cache/v1/api.json',
    aws:              cfg.aws,
    component:        cfg.purgeCache.statsComponent,
    drain:            influx
  });

  debug("Configuring app");

  // Create app
  var app = base.app({
    port:           cfg.server.port,
    env:            cfg.server.env,
    forceSSL:       cfg.server.forceSSL,
    trustProxy:     cfg.server.trustProxy,
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
    console.log("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;
