#!/usr/bin/env node
var base    = require('taskcluster-base');
var data    = require('../data');
var v1      = require('../routes/api/v1');
var routes  = require('../routes');
var path    = require('path');
var debug   = require('debug')('taskcluster-auth:bin:server');
var Promise = require('promise');

/** Launch server */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'server_publicUrl',
      'server_cookieSecret',
      'azureTable_accountName',
      'azureTable_accountKey',
      'azureTable_accountUrl',
      'aws_accessKeyId',
      'aws_secretAccessKey'
    ],
    filename:     'taskcluster-auth'
  });

  // Configure client table
  var Client = data.Client.configure({
    tableName:    cfg.get('auth:clientTableName'),
    credentials:  cfg.get('azureTable')
  });

  // Initialize validator and publish schemas if needed
  var validator = null;
  var validatorLoaded = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('auth:publishMetaData') === 'true',
    schemaPrefix:     'auth/v1/',
    aws:              cfg.get('aws')
  }).then(function(validator_) {
    validator = validator_;
  });

  // Load validator and create client table before proceeding
  return Promise.all(
    validatorLoaded,
    Client.createTable()
  ).then(function() {
    // Create API router and publish reference if needed
    return v1.setup({
      context: {
        validator:      validator,
        Client:         Client
      },
      validator:        validator,
      clientLoader:     Client.createClientLoader(),
      publish:          cfg.get('auth:publishMetaData') === 'true',
      baseUrl:          cfg.get('server:publicUrl') + '/v1',
      referencePrefix:  'auth/v1/api.json',
      aws:              cfg.get('aws')
    });
  }).then(function(router) {
    // Create app
    var app = base.app({
      port:           Number(process.env.PORT || cfg.get('server:port'))
    });

    // Mount API router
    app.use('/v1', router);

    // Setup middleware and authentication
    var ensureAuth = app.setup({
      cookieSecret:   cfg.get('server:cookieSecret'),
      viewFolder:     path.join(__dirname, '..', 'views'),
      assetFolder:    path.join(__dirname, '..', 'assets'),
      development:    cfg.get('server:development') === 'true',
      publicUrl:      cfg.get('server:publicUrl')
    });

    // Provide a client
    app.globals = {
      Client:         Client
    };

    // Route configuration
    app.get('/',                                       routes.index);
    app.get('/unauthorized',                           routes.unauthorized);
    app.get('/client',                    ensureAuth,  routes.client.list);
    app.get('/client/create',             ensureAuth,  routes.client.create);
    app.get('/client/:clientId/view',     ensureAuth,  routes.client.view);
    app.get('/client/:clientId/edit',     ensureAuth,  routes.client.edit);
    app.get('/client/:clientId/delete',   ensureAuth,  routes.client.delete);
    app.post('/client/update',            ensureAuth,  routes.client.update)

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
    debug("Launched authentication server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;