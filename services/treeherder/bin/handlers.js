#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('treeherder:bin:handlers');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var Handlers    = require('../treeherder/handlers');
var Project     = require('mozilla-treeherder/project');
var _           = require('lodash');

/** Launch handlers */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'treeherder_routePrefix',
      'treeherder_baseUrl',
      'treeherder_projects',
      'taskcluster_queueBaseUrl',
      'amqp_url',
      'influx_connectionString',
      'treeherder_listenerQueueName'
    ],
    filename:     'taskcluster-treeherder'
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
    component:  cfg.get('treeherder:statsComponent'),
    process:    'handlers'
  });

  // Configure queue and queueEvents
  var queue = new taskcluster.Queue({
    baseUrl:        cfg.get('taskcluster:queueBaseUrl')
  });
  var queueEvents = new taskcluster.QueueEvents({
    exchangePrefix: cfg.get('taskcluster:queueExchangePrefix')
  });

  // Load Project objects
  var projects = [];
  _.forIn(JSON.parse(cfg.get('treeherder:projects')), function(project, name) {
    projects.push(new Project(name, {
      consumerKey:          project.consumer_key,
      consumerSecret:       project.consumer_secret,
      baseUrl:              cfg.get('treeherder:baseUrl')
    }));
  });

  // Create event handlers
  var handlers = new Handlers({
    queue:              queue,
    queueEvents:        queueEvents,
    connectionString:   cfg.get('amqp:url'),
    queueName:          cfg.get('treeherder:listenerQueueName'),
    routePrefix:        cfg.get('treeherder:routePrefix'),
    projects:           projects,
    drain:              influx,
    component:          cfg.get('treeherder:statsComponent')
  });

  // Start listening for events and handle them
  return handlers.setup().then(function() {
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
