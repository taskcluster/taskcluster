#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('index:bin:droptables');
var data        = require('../index/data');
var base        = require('taskcluster-base');

/** Launch drop-tables */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'azure_accountName',
      'azure_accountKey'
    ],
    filename:     'taskcluster-index'
  });

  // Configure IndexedTask and Namespace entities
  var IndexedTask = data.IndexedTask.configure({
    tableName:        cfg.get('index:indexedTaskTableName'),
    credentials:      cfg.get('azure')
  });
  var Namespace = data.Namespace.configure({
    tableName:        cfg.get('index:namespaceTableName'),
    credentials:      cfg.get('azure')
  });

  // Delete tables
  return Promise.all([
    IndexedTask.deleteTable(),
    Namespace.deleteTable()
  ]).then(function() {
    console.log('Azure tables now deleted');

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();
  });
};

// If droptables.js is executed start the droptables
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: droptables.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched droptables successfully");
  }).catch(function(err) {
    debug("Failed to start droptables, err: %s, as JSON: %j",
          err, err, err.stack);
    // If we didn't launch the droptables we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;