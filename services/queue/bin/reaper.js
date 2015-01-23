#!/usr/bin/env node
var base          = require('taskcluster-base');
var path          = require('path');
var debug         = require('debug')('queue:bin:reaper');
var Promise       = require('promise');
var exchanges     = require('../queue/exchanges')
var TaskModule    = require('../queue/task.js')
var Reaper        = require('../queue/reaper');
var QueueService  = require('../queue/queueservice');


/** Launch server */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'pulse_username',
      'pulse_password',
      'queue_signatureSecret',
      'database_connectionString',
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
    process:    'reaper'
  });


  // Create Task subclass wrapping database access
  var Task = TaskModule.configure({
    connectionString:   process.env.DATABASE_URL ||
                        cfg.get('database:connectionString')
  });

  // Create QueueService to manage azure queues
  var queueService = new QueueService({
    prefix:           cfg.get('queue:queuePrefix'),
    credentials:      cfg.get('azure'),
    signatureSecret:  cfg.get('queue:signatureSecret')
  });

  // Setup AMQP exchanges and create a publisher
  // First create a validator, though
  var publisherCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
  }).then(function(validator) {
    return exchanges.connect({
      credentials:        cfg.get('pulse'),
      exchangePrefix:     cfg.get('queue:exchangePrefix'),
      validator:          validator,
      drain:              influx,
      component:          cfg.get('queue:statsComponent'),
      process:            'reaper'
    });
  });

  // Wait for publisher and database schema to be created
  return Promise.all([
    publisherCreated,
    Task.ensureTables()
  ]).then(function(values) {
    // Get the publisher
    var publisher = values.shift();

    // Create and start a new reaper
    var reaper = new Reaper({
      interval:     Number(cfg.get('queue:reaper:interval')),
      errorLimit:   Number(cfg.get('queue:reaper:errorLimit')),
      Task:         Task,
      publisher:    publisher,
      queueService: queueService,
      start:        true
    });

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();

    // Handle errors by crashing
    reaper.on('error', function(err) {
      console.log("Error in reaper, now crashing: ", err);
      process.exit(1);
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