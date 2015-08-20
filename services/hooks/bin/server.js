#!/usr/bin/env node
var debug   = require('debug')('hooks:bin:server');
var base    = require('taskcluster-base');
var v1      = require('../routes/v1');
var path    = require('path');
var Promise = require('promise');

/* Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:  require('../config/defaults'),
    profile:   require('../config/' + profile),
    filename:  'taskcluster-hooks'
  });

  // Create a validator
  debug("Waiting for resources to be created");
  var validator, publisher;
  await Promise.all([
      (async () => {
        validator = await base.validator({
          folder:        path.join(__dirname, '..', 'schemas'),
          constants:     require('../schemas/constants'),
          publish:       false,
          schemaPrefix:  'hooks/v1/'
        });
      })()
      ]);

  // Create API router and publish reference if needed
  debug("Creating API router");

  var router = await v1.setup({
    validator:        validator,
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
    credentials:      cfg.get('taskcluster:credentials'),
    baseUrl:          cfg.get('server:publicUrl') + '/v1',
    referencePrefix:  'hooks/v1/api.json'
  });

  debug("Configuring app");

  // create app
  var app = base.app({
    port:        Number(process.env.PORT || cfg.get('server:port')),
    env:         cfg.get('server:env'),
    forceSSL:    cfg.get('server:forceSSL'),
    trustProxy:  cfg.get('server:trustProxy')
  });

  // Mount API router
  app.use('/v1', router);

  // create server
  debug("Launching server");
  return app.createServer();
};

if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: server.js [profile]");
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched server sucessfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    process.exit(1);
  });
}

module.exports = launch;
