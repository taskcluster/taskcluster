#!/usr/bin/env node
var base    = require('taskcluster-base');
var debug   = require('debug')('queue:bin:dropdb');
var schema  = require('../queue/schema');

/** Drop database */
var dropdb = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'database_connectionString'
    ],
    filename:     'taskcluster-queue'
  });

  // Connect to task database store
  var knex = require('knex').initialize({
    client:       'postgres',
    connection:   cfg.get('database:connectionString')
  });

  // Destroy the database
  return schema.destroy(knex).then(function() {
    // TODO Destroy knex connection
  });
};

// If dropdb.js is executed call dropdb
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: dropdb.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // dropdb with given profile
  dropdb(profile).then(function() {
    debug("Dropped database successfully");
  }).catch(function(err) {
    debug("Failed to drop database, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't drop the database we should crash
    process.exit(1);
  });
}

// Export dropdb in-case anybody cares
module.exports = dropdb;