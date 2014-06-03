#!/usr/bin/env node
var base      = require('taskcluster-base');
var v1        = require('../routes/api/v1');
var path      = require('path');
var debug     = require('debug')('queue:bin:server');
var Promise   = require('promise');
var exchanges = require('../queue/exchanges');
var schema    = require('../queue/schema');
var TaskStore = require('../queue/taskstore');
var Tasks     = require('../queue/tasks');
var Knex      = require('knex');

/** Launch server */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'amqp_url',
      'database_connectionString',
      'queue_publishMetaData',
      'aws_accessKeyId',
      'aws_secretAccessKey'
    ],
    filename:     'taskcluster-queue'
  });

  // Connect to task database store
  var knex = Knex({
    client:       'postgres',
    connection:   cfg.get('database:connectionString')
  });

  // Create database schema
  var schemaCreated = schema.create(knex);

  // Setup AMQP exchanges and create a publisher
  // First create a validator and then publisher
  var validator = null;
  var publisher = null;
  var publisherCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    publish:          cfg.get('queue:publishMetaData') === 'true',
    schemaPrefix:     'queue/v1/',
    aws:              cfg.get('aws')
  }).then(function(validator_) {
    validator = validator_;
    return exchanges.setup({
      connectionString:   cfg.get('amqp:url'),
      exchangePrefix:     cfg.get('queue:exchangePrefix'),
      validator:          validator,
      referencePrefix:    'queue/v1/exchanges.json',
      publish:            cfg.get('queue:publishMetaData') === 'true'
    });
  }).then(function(publisher_) {
    publisher = publisher_;
  });

  // Create tasks access utility
  var tasks = new Tasks({
    aws:                cfg.get('aws'),
    bucket:             cfg.get('queue:tasks:bucket'),
    publicBaseUrl:      cfg.get('queue:tasks:publicBaseUrl')
  });

  // When: publisher, schema and validator is created, proceed
  return Promise.all(
    publisherCreated,
    schemaCreated
  ).then(function() {
    // Create API router and publish reference if needed
    return v1.setup({
      context: {
        config:         cfg,
        bucket:         tasks,
        store:          new TaskStore(knex),
        publisher:      publisher,
        validator:      validator
      },
      validator:        validator,
      publish:          cfg.get('queue:publishMetaData') === 'true',
      baseUrl:          cfg.get('server:publicUrl') + '/v1',
      referencePrefix:  'queue/v1/api.json',
      aws:              cfg.get('aws')
    });
  }).then(function(router) {
    // Create app
    var app = base.app({
      port:           Number(process.env.PORT || cfg.get('server:port'))
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
    debug("Launched authentication server successfully");
  }).catch(function(err) {
    debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the server we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;