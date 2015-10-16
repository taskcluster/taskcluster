#!/usr/bin/env node
var base        = require('taskcluster-base');
var data        = require('../hooks/data');
var debug       = require('debug')('hooks:schedule-hooks');
var path        = require('path');
var Promise     = require('promise');
var Scheduler   = require('../hooks/scheduler');
var taskcreator = require('../hooks/taskcreator');

/* Launch schedule-hooks */
var launch = async function(profile, options) {
  options = options || {};

  debug("Launching with profile: %s", profile);

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
      'azure_accountKey'
    ],
    filename:  'taskcluster-hooks'
  });

  // Create Hooks table
  var Hook = data.Hook.setup({
    table:        cfg.get('hooks:hookTableName'),
    credentials:  cfg.get('azure'),
    process:      'schedule-hooks'
  });

  // Create a validator
  debug("Waiting for resources to be created");
  await Hook.ensureTable();

  // Create scheduler
  var scheduler = new Scheduler({
    Hook:           Hook,
    taskcreator:    new taskcreator.TaskCreator({
      credentials:  cfg.get('taskcluster:credentials'),
    }),
    pollingDelay:   cfg.get('hooks:schedule:pollingDelay')
  });

  // Start scheduler
  if (!options.noStart) {
    scheduler.start();
  }

  // Notify the parent process, so this worker can run using LocalApp
  base.app.notifyLocalAppInParentProcess();

  return scheduler;
};

// If schedule-hooks.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: schedule-hooks.js [profile]");
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched schedule-hooks sucessfully");
  }).catch(function(err) {
    debug("Failed to start schedule-hooks, err: %s, as JSON: %j",
          err, err, err.stack);
    process.exit(1);
  });
}

module.exports = launch;
