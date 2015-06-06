#!/usr/bin/env node
var debug         = require('debug')('queue:bin:expire-queues');
var base          = require('taskcluster-base');
var path          = require('path');
var assert        = require('assert');
var QueueService  = require('../queue/queueservice');

/** Launch expire-queues */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'queue_publishMetaData',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'azure_accountName',
      'azure_accountKey',
      'influx_connectionString'
    ],
    filename:     'taskcluster-queue'
  });

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx({
    connectionString:   cfg.get('influx:connectionString'),
    maxDelay:           cfg.get('influx:maxDelay'),
    maxPendingPoints:   cfg.get('influx:maxPendingPoints')
  });

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      influx,
    component:  cfg.get('queue:statsComponent'),
    process:    'expire-queues'
  });

  // Create QueueService to manage azure queues
  var queueService = new QueueService({
    prefix:           cfg.get('queue:queuePrefix'),
    credentials:      cfg.get('azure'),
    claimQueue:       cfg.get('queue:claimQueue'),
    deadlineQueue:    cfg.get('queue:deadlineQueue'),
    deadlineDelay:    cfg.get('queue:deadlineDelay')
  });

  // Notify parent process, so that this worker can run using LocalApp
  base.app.notifyLocalAppInParentProcess();

  // Expire queues
  debug("Expiring queues at: %s", new Date());
  var count = await queueService.deleteUnusedWorkerQueues();
  debug("Expired %s queues", count);

  // Stop recording statistics and send any stats that we have
  base.stats.stopProcessUsageReporting();
  return influx.close();
};

// If expire-queues.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: expire-queues.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Expired queues successfully");
    // Close the process we're done now
    process.exit(0);
  }).catch(function(err) {
    debug("Failed to start expire-queues, err: %s, as JSON: %j",
          err, err, err.stack);
    // If we didn't launch the expire-queues we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;