#!/usr/bin/env node
var debug               = require('debug')('queue:bin:deadline-reaper');
var base                = require('taskcluster-base');
var path                = require('path');
var Promise             = require('promise');
var _                   = require('lodash');
var data                = require('../queue/data');
var taskcluster         = require('taskcluster-client');
var assert              = require('assert');
var DeadlineResolver    = require('../queue/deadlineresolver');
var QueueService        = require('../queue/queueservice');
var exchanges           = require('../queue/exchanges');


/** Launch deadline-reaper */
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
    process:    'deadline-reaper'
  });

  // Create task table
  var Task = data.Task.setup({
    table:              cfg.get('queue:taskTableName'),
    credentials:        cfg.get('azure')
  });

  // Create QueueService to manage azure queues
  var queueService = new QueueService({
    prefix:           cfg.get('queue:queuePrefix'),
    credentials:      cfg.get('azure'),
    claimQueue:       cfg.get('queue:claimQueue'),
    deadlineQueue:    cfg.get('queue:deadlineQueue'),
    deadlineDelay:    cfg.get('queue:deadlineDelay')
  });

  debug("Waiting for resources to be created");
  var validator, publisher;
  await Promise.all([
    (async () => {
      validator = await base.validator({
        folder:           path.join(__dirname, '..', 'schemas'),
        constants:        require('../schemas/constants'),
        schemaPrefix:     'queue/v1/'
      });

      publisher = await exchanges.setup({
        credentials:        cfg.get('pulse'),
        exchangePrefix:     cfg.get('queue:exchangePrefix'),
        validator:          validator,
        referencePrefix:    'queue/v1/exchanges.json',
        drain:              influx,
        component:          cfg.get('queue:statsComponent'),
        process:            'deadline-reaper'
      });
    })(),
    Task.ensureTable()
  ]);

  // Create resolver
  var resolver = new DeadlineResolver({
    Task:             Task,
    queueService:     queueService,
    publisher:        publisher,
    pollingDelay:     cfg.get('queue:deadline:pollingDelay'),
    parallelism:      cfg.get('queue:deadline:parallelism')
  });

  // Start resolver
  resolver.start();

  // Notify parent process, so that this worker can run using LocalApp
  base.app.notifyLocalAppInParentProcess();

  return resolver;
};

// If claim-reaper.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: claim-reaper.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched claim-reaper successfully");
  }).catch(function(err) {
    debug("Failed to start claim-reaper, err: %s, as JSON: %j",
          err, err, err.stack);
    // If we didn't launch the claim-reaper we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;