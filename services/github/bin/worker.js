#!/usr/bin/env node
var debug             = require('debug')('github:worker');
var assert            = require('assert');
var path              = require('path');
var base              = require('taskcluster-base');
var Promise           = require('promise');
var exchanges         = require('../lib/exchanges');
var common            = require('../lib/common');
var worker            = require('../lib/worker');
var _                 = require('lodash');
var taskcluster       = require('taskcluster-client');
var Octokat           = require('octokat');

/** Launch worker */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  var cfg = common.loadConfig(profile);

  try {
    var statsDrain = common.buildInfluxStatsDrain(
      cfg.get('influx:connectionString'),
      cfg.get('influx:maxDelay'),
      cfg.get('influx:maxPendingPoints')
    );
  } catch(e) {
    debug("Missing influx_connectionStraing: stats collection disabled.");
    var statsDrain = common.stdoutStatsDrain;
  }

  // For use in validation of taskclusterrc files
  let validator = await common.buildValidator(cfg);

  // Create a single connection to the GithubAPI to pass around
  var githubAPI = new Octokat(cfg.get('github:credentials'));

  var scheduler = new taskcluster.Scheduler(cfg.get('taskcluster'));

  // A context to be passed into message handlers
  let context = {cfg, githubAPI, scheduler, validator};

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      statsDrain,
    component:  cfg.get('taskclusterGithub:statsComponent'),
    process:    'worker'
  });

  let pulseCredentials = cfg.get('pulse')
  assert(pulseCredentials.username, 'Username must be supplied for pulse connection');
  assert(pulseCredentials.password, 'Password must be supplied for pulse connection');

  var webHookListener = new taskcluster.PulseListener({
    queueName:  profile,
    credentials: {
      username: pulseCredentials.username,
      password: pulseCredentials.password
    }
  });

  let exchangeReference = exchanges.reference({
    exchangePrefix:   cfg.get('taskclusterGithub:exchangePrefix'),
    credentials:      cfg.get('pulse')
  });

  let GitHubEvents = taskcluster.createClient(exchangeReference);
  let githubEvents = new GitHubEvents();

  // Only listen for opened and updated pull request events, since those
  // are the only cases where we should launch a job.
  await webHookListener.bind(githubEvents.pullRequest(
    {organization: '*', repository: '*', action: 'opened'}));
  await webHookListener.bind(githubEvents.pullRequest(
    {organization: '*', repository: '*', action: 'updated'}));

  // Launch jobs for push events as well.
  await webHookListener.bind(githubEvents.push(
    {organization: '*', repository: '*'}));

  // Listen for, and handle, changes in graph/task state: to reset status
  // messages, send notifications, etc....
  let schedulerEvents = new taskcluster.SchedulerEvents();
  let route = 'route.taskcluster-github.*.*.*';
  webHookListener.bind(schedulerEvents.taskGraphRunning(route));
  webHookListener.bind(schedulerEvents.taskGraphBlocked(route));
  webHookListener.bind(schedulerEvents.taskGraphFinished(route));

  // Route recieved messages to an appropriate handler via matching
  // exchange names to a regular expression
  let webHookHandlerExp = RegExp('(.*pull-request|.*push)', 'i');
  let graphChangeHandlerExp = RegExp('exchange/taskcluster-scheduler/.*', 'i');
  webHookListener.on('message', function(message) {
    if (webHookHandlerExp.test(message.exchange)) {
      worker.webHookHandler(message, context);
    } else if (graphChangeHandlerExp.test(message.exchange)) {
      worker.graphStateChangeHandler(message, context);
    } else {
      debug('Ignoring message from unsupported exchange:', message.exchange);
    }
  });
  await webHookListener.resume();
};

// If worker.js is executed start the worker
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: worker.js [profile]");
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched worker successfully");
  }).catch(function(err) {
    debug("Failed to start worker, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the worker we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;
