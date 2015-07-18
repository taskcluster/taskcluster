#!/usr/bin/env node
var debug             = require('debug')('github:server');
var base              = require('taskcluster-base');
var api               = require('../lib/api');
var path              = require('path');
var Promise           = require('promise');
var exchanges         = require('../lib/exchanges');
var _                 = require('lodash');

/** Launch server */
var launch = async function(profile, publisher) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'taskclusterGithub_publishMetaData',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString',
      'webhook_secret'
    ],
    filename:     'taskcluster-github'
  });

  // Create a default stats drain, which just prints to stdout
  let statsDrain = {
      addPoint: (...args) => {debug("stats:", args)}
  }

  // Create InfluxDB connection for submitting statistics
  let influxConnectionString = cfg.get('influx:connectionString')
  if (influxConnectionString) {
      statsDrain = new base.stats.Influx({
        connectionString:   influxConnectionString,
        maxDelay:           cfg.get('influx:maxDelay'),
        maxPendingPoints:   cfg.get('influx:maxPendingPoints')
      });
  } else {
      debug("Missing influx_connectionString: stats collection disabled.")
  }

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      statsDrain,
    component:  cfg.get('taskclusterGithub:statsComponent'),
    process:    'server'
  });

  let validator = await base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('taskclusterGithub:publishMetaData') === 'true',
    schemaPrefix:     'github/v1/',
    aws:              cfg.get('aws')
  });

  let pulseCredentials = cfg.get('pulse')
  if (publisher) {
    debug("Using a custom publisher instead of pulse")
  } else if (pulseCredentials.username && pulseCredentials.password) {
      publisher = await exchanges.setup({
        credentials:        pulseCredentials,
        exchangePrefix:     cfg.get('taskclusterGithub:exchangePrefix'),
        validator:          validator,
        referencePrefix:    'github/v1/exchanges.json',
        publish:            cfg.get('taskclusterGithub:publishMetaData') === 'true',
        aws:                cfg.get('aws'),
        drain:              statsDrain,
        component:          cfg.get('taskclusterGithub:statsComponent'),
        process:            'server'
      });
 } else {
    throw "Can't initialize pulse publisher: missing credentials"
 }

  // Create API router and publish reference if needed
  debug("Creating API router");

  let router = await api.setup({
    context:          {publisher, cfg},
    validator:        validator,
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
    credentials:      cfg.get('taskcluster:credentials'),
    publish:          cfg.get('taskclusterGithub:publishMetaData') === 'true',
    baseUrl:          cfg.get('server:publicUrl') + '/v1',
    referencePrefix:  'github/v1/api.json',
    aws:              cfg.get('aws'),
    component:        cfg.get('taskclusterGithub:statsComponent'),
    drain:            statsDrain
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
    console.log("Usage: server.js [profile]");
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
