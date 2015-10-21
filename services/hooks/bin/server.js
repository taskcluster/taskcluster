#!/usr/bin/env node
var base        = require('taskcluster-base');
var data        = require('../hooks/data');
var debug       = require('debug')('hooks:bin:server');
var path        = require('path');
var Promise     = require('promise');
var taskcreator = require('../hooks/taskcreator');
var v1          = require('../routes/v1');

/* Launch server */
var launch = async function(profile, options) {
  debug("Launching with profile: %s", profile);
  options = options || {};

  // Load configuration
  var cfg = base.config({
    defaults:  require('../config/defaults'),
    profile:   require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'azure_accountName',
      'azure_accountKey',
      'hooks_tableSigningKey',
      'hooks_tableCryptoKey',
      'hooks_publishMetaData',
    ],
    filename:  'taskcluster-hooks'
  });

  // Create Hooks table
  var Hook = data.Hook.setup({
    account:      cfg.get('hooks:azureAccount'),
    table:        cfg.get('hooks:hookTableName'),
    credentials:  cfg.get('taskcluster:credentials'),
    authBaseUrl:  cfg.get('taskcluster:authBaseUrl'),
    signingKey:   cfg.get('hooks:tableSigningKey'),
    cryptoKey:    cfg.get('hooks:tableCryptoKey'),
    process:      'server'
  });

  // Create a validator
  debug("Waiting for resources to be created");
  var validator, publisher;
  await Promise.all([
      (async () => {
        validator = await base.validator({
          folder:        path.join(__dirname, '..', 'schemas'),
          constants:     require('../schemas/constants'),
          publish:       cfg.get('hooks:publishMetaData') == 'true',
          schemaPrefix:  'hooks/v1/',
          preload: [
            'http://schemas.taskcluster.net/queue/v1/create-task-request.json',
            'http://schemas.taskcluster.net/queue/v1/task-status.json'
          ]
        });
      })(),
      Hook.ensureTable(),
  ]);

  // Create API router and publish reference if needed
  debug("Creating API router");

  var creator = options.taskcreator || new taskcreator.TaskCreator({
        credentials:  cfg.get('taskcluster:credentials'),
  });
  var router = await v1.setup({
    context: {
      Hook:           Hook,
      taskcreator:    creator,
    },
    validator:        validator,
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl'),
    pubish:           cfg.get('hooks:publishMetaData') == 'true',
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
