#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('index:bin:handlers');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var data        = require('../index/data');
var Handlers    = require('../index/handlers');

/** Launch handlers */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'taskcluster_queueBaseUrl',
      'taskcluster_authBaseUrl',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'index_azureAccount',
      'pulse_username',
      'pulse_password',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString'
    ],
    filename:     'taskcluster-index'
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
    component:  cfg.get('index:statsComponent'),
    process:    'handlers'
  });

  // Configure IndexedTask and Namespace entities
  var IndexedTask = data.IndexedTask.setup({
    account:          cfg.get('index:azureAccount'),
    table:            cfg.get('index:indexedTaskTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });
  var Namespace = data.Namespace.setup({
    account:          cfg.get('index:azureAccount'),
    table:            cfg.get('index:namespaceTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });

  // Create a validator
  var validator = null;
  var validatorCreated = base.validator({
    folder:           path.join(__dirname, '..', 'schemas'),
    constants:        require('../schemas/constants'),
    schemaPrefix:     'index/v1/'
  }).then(function(validator_) {
    validator = validator_;
  });

  // Configure queue and queueEvents
  var queue = new taskcluster.Queue({
    baseUrl:        cfg.get('taskcluster:queueBaseUrl'),
    credentials:    cfg.get('taskcluster:credentials')
  });
  var queueEvents = new taskcluster.QueueEvents({
    exchangePrefix: cfg.get('taskcluster:queueExchangePrefix')
  });

  // When: validator is created, proceed
  return validatorCreated.then(function() {
    // Create event handlers
    var handlers = new Handlers({
      IndexedTask:        IndexedTask,
      Namespace:          Namespace,
      queue:              queue,
      queueEvents:        queueEvents,
      credentials:        cfg.get('pulse'),
      queueName:          cfg.get('index:listenerQueueName'),
      routePrefix:        cfg.get('index:routePrefix'),
      drain:              influx,
      component:          cfg.get('index:statsComponent')
    });

    // Start listening for events and handle them
    return handlers.setup();
  }).then(function() {
    debug('Handlers are now listening for events');

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();
  });
};

// If handlers.js is executed start the handlers
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: handlers.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched handlers successfully");
  }).catch(function(err) {
    debug("Failed to start handlers, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the handlers we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;