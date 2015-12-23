#!/usr/bin/env node
import Debug from 'debug';
import base from 'taskcluster-base';
import api from '../lib/api';
import data from '../lib/data';
import path from 'path';
import common from '../lib/common';
import Promise from 'promise';
import _ from 'lodash';

let debug = Debug('secrets:server');

/** Launch server */
let launch = async function(profile) {
  debug("Launching with profile: %s", profile);
  var cfg = common.loadConfig(profile);

  try {
    var statsDrain = common.buildInfluxStatsDrain(
      cfg.get('influx:connectionString'),
      cfg.get('influx:maxDelay'),
      cfg.get('influx:maxPendingPoints')
    );
  } catch(e) {
    debug("Missing influx_connectionStraing: stats collection disabled.");
    var statsDrain = common.stdoutStatsDrain;
  }

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      statsDrain,
    component:  cfg.get('taskclusterSecrets:statsComponent'),
    process:    'server'
  });

  let validator = await common.buildValidator(cfg);
  let entity = data.SecretEntity.setup({
    account:          cfg.get('azure:accountName'),
    credentials:      cfg.get('taskcluster:credentials'),
    table:            cfg.get('azure:tableName'),
    cryptoKey:        cfg.get('azure:cryptoKey'),
    signingKey:       cfg.get('azure:signingKey'),
    drain:            statsDrain,
    component:        cfg.get('taskclusterSecrets:statsComponent'),
    process:          'server'
  });

  // Create API router and publish reference if needed
  debug("Creating API router");

  let router = await api.setup({ context:          {cfg, entity}, authBaseUrl:
  cfg.get('taskcluster:authBaseUrl'), validator:        validator, publish:
  cfg.get('taskclusterSecrets:publishMetaData') === 'true', baseUrl:
  cfg.get('server:publicUrl') + '/v1', referencePrefix:  'secrets/v1/api.json',
  aws:              cfg.get('aws'), component:
  cfg.get('taskclusterSecrets:statsComponent'), drain:            statsDrain
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

