#!/usr/bin/env node
var base      = require('taskcluster-base');
var path      = require('path');
var debug     = require('debug')('queue:bin:reaper');
var Promise   = require('promise');
var exchanges = require('../queue/exchanges');
var schema    = require('../queue/schema');
var TaskStore = require('../queue/taskstore');
var Knex      = require('knex');
var Reaper    = require('../queue/reaper');

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
  // First create a validator, though
  var publisherCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
  }).then(function(validator) {
    return exchanges.connect({
      connectionString:   cfg.get('amqp:url'),
      exchangePrefix:     cfg.get('queue:exchangePrefix'),
      validator:          validator
    });
  });

  // Wait for publisher and database schema to be created
  return Promise.all(
    publisherCreated,
    schemaCreated
  ).then(function(values) {
    // Get the publisher
    var publisher = values.shift();

    // Create and start a new reaper
    var reaper = new Reaper({
      interval:     Number(cfg.get('queue:reaper:interval')),
      errorLimit:   Number(cfg.get('queue:reaper:errorLimit')),
      store:        new TaskStore(knex),
      publisher:    publisher,
      start:        true
    });

    // Return started reaper process
    return reaper;
  });
};

// If reaper.js is executed call launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: reaper.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched reaper successfully");
  }).catch(function(err) {
    debug("Failed to start reaper, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the reaper we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;