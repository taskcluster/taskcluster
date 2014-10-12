var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var Promise     = require('promise');
var debug       = require('debug')('treeherder:handlers');
var _           = require('lodash');
var base        = require('taskcluster-base');
var slugid      = require('slugid');

/**
 * Create handlers
 *
 * options:
 * {
 *   queue:              // taskcluster.Queue
 *   queueEvents:        // taskcluster.QueueEvents instance
 *   connectionString:   // AMQP connection string
 *   queueName:          // Queue name (optional)
 *   routePrefix:        // Routing-key prefix for
 *                       // "route.<routePrefix>.<project>.<revisionHash>"
 *   projects:           // List of Project objects from mozilla-treeherder
 *   drain:              // new base.Influx(...)
 *   component:          // Component name in statistics
 * }
 */
var Handlers = function(options) {
  // Validate options
  assert(options.queue instanceof taskcluster.Queue,
         "And instance of taskcluster.Queue is required");
  assert(options.queueEvents instanceof taskcluster.QueueEvents,
         "An instance of taskcluster.QueueEvents is required");
  assert(options.connectionString,  "Connection string must be provided");
  assert(options.routePrefix,       "routePrefix is required");
  assert(options.projects,          "treeherder projects");
  assert(options.drain,             "statistics drains is required");
  assert(options.component,         "component name is needed for statistics");
  // Store options on this for use in event handlers
  this.queue            = options.queue;
  this.queueEvents      = options.queueEvents;
  this.connectionString = options.connectionString;
  this.prefetch         = options.prefetch;
  this.routePrefix      = options.routePrefix;
  this.projects         = options.projects;
  this.queueName        = options.queueName;  // Optional
  this.drain            = options.drain;
  this.component        = options.component;
  this.listener         = null;
};

/** Setup handlers and start listening */
Handlers.prototype.setup = function() {
  assert(this.listener === null, "Cannot setup twice!");
  var that = this;

  // Create listener
  this.listener = new taskcluster.Listener({
    connectionString:     this.connectionString,
    queueName:            this.queueName,
    prefetch:             this.prefetch
  });

  // Regular expression to parse route pattern:
  // <routePrefix>.<project>.<revisionHash>
  var routeRegExp = new RegExp("^" + this.routePrefix + "\\.([^.]+).([^.]+)$");

  // Construct routing pattern
  var routingPattern = [
    'route',
    that.routePrefix,
    '*',              // project
    '*'               // revisionHash
  ].join('.');

  // Bind to interesting events
  var bound = Promise.all([
    this.listener.bind(this.queueEvents.taskDefined(routingPattern)),
    this.listener.bind(this.queueEvents.taskPending(routingPattern)),
    this.listener.bind(this.queueEvents.taskRunning(routingPattern)),
    this.listener.bind(this.queueEvents.taskCompleted(routingPattern)),
    this.listener.bind(this.queueEvents.taskFailed(routingPattern))
  ]);

  // Create message handler
  var handler = function(message) {
    // Find projects and revision hashes from custom routes
    // Note, in most cases it's probably sane to assume that we'll only want to
    // report for one treeherder project. But we can report to multiple should
    // we ever want to for some reason. Either way, there will be cases where
    // tasks are indexed or otherwise have unrelated custom routes associated,
    // so we must filter out these unrelated custom routes.
    var reportFor = message.routes.map(function(route) {
      // Check that it matches: treeherder.<project>.<revisionHash>
      return routeRegExp.exec(route);
    }).filter(function(match) {
      // Check that routing pattern matched
      return match;
    }).filter(function(match) {
      // Check that the project exists
      var project = _.find(that.projects, function(project) {
        return project.project === match[1];
      });
      if (!project) {
        debug("WARNING: received message from unknown project: %s, message: %j",
              projectName, message);
      }
      return project !== undefined;
    }).map(function(match) {
      // Find project
      var project = _.find(that.projects, function(project) {
        return project.project === match[1];
      });
      assert(project, "Project must exist, we just filtered for it");
      // Extract project and revisionHash
      return {
        project:      project,
        revisionHash: match[2]
      };
    });

    // Load task
    return that.queue.getTask(
      message.payload.status.taskId
    ).then(function(task) {
      return Promise.all(reportFor.map(function(target) {
        if (message.exchange === that.queueEvents.taskDefined().exchange) {
          return that.defined(message, task, target);
        }
        if (message.exchange === that.queueEvents.taskPending().exchange) {
          return that.pending(message, task, target);
        }
        if (message.exchange === that.queueEvents.taskRunning().exchange) {
          return that.running(message, task, target);
        }
        if (message.exchange === that.queueEvents.taskCompleted().exchange) {
          return that.completed(message, task, target);
        }
        if (message.exchange === that.queueEvents.taskFailed().exchange) {
          return that.failed(message, task, target);
        }

        debug("WARNING: got message from unknown exchange: %s, message: %j",
              message.exchange, message);
      }));
    }).then(function() {
      debug("Reported %s to treeherder from exchange: %s",
            message.payload.status.taskId, message.exchange);
    });
  };

  // Create timed handler for statistics
  var timedHandler = base.stats.createHandlerTimer(handler, {
    drain:      this.drain,
    component:  this.component
  });

  // Listen for messages and handle them
  this.listener.on('message', timedHandler);

  // Start listening
  return this.listener.connect().then(function() {
    return bound;
  }).then(function() {
    return that.listener.resume();
  });
};

// Export Handlers
module.exports = Handlers;

/** Convert Date object or JSON date-time string to UNIX timestamp */
var timestamp = function(date) {
  return Math.floor(new Date(date).getTime() / 1000);
};

/** Get treeherder state from a run */
var stateFromRun = function(run) {
  if (run.state === 'failed') {
    return 'completed';
  }
  return run.state;
};

/** Get treeherder result from run */
var resultFromRun = function(run) {
  if (run.state === 'failed') {
    return 'exception';
  }
  if (run.state === 'completed') {
    return run.success ? 'success' : 'testfailed';
  }
  return 'unknown';
};

/** Handle notifications of defined task */
Handlers.prototype.defined = function(message, task, target) {
  var that    = this;
  var status  = message.payload.status;
  return target.project.postJobs([{
    project:            target.project.project,
    revision_hash:      target.revisionHash,
    job: {
      job_guid:         slugid.decode(status.taskId) + '/' + 0,
      build_platform: {
          platform:     status.workerType,
          os_name:      '-',
          architecture: '-'
      },
      machine_platform: {
          platform:     status.workerType,
          os_name:      '-',
          architecture: '-'
      },
      name:             task.metadata.name,
      reason:           'scheduled',  // use reasonCreated or reasonResolved
      job_symbol:       task.extra.treeherder.symbol,
      group_name:       task.extra.treeherder.groupName,
      group_symbol:     task.extra.treeherder.groupSymbol,
      product_name:     task.extra.treeherder.productName,
      submit_timestamp: timestamp(task.created),
      start_timestamp:  undefined,
      end_timestamp:    undefined,
      state:            'pending',
      result:           'unknown',
      who:              task.metadata.owner,
      // You _must_ pass option collection until
      // https://github.com/mozilla/treeherder-service/issues/112
      option_collection: {
        opt:    true
      }
    }
  }]);
};

/** Handle notifications of pending task */
Handlers.prototype.pending = function(message, task, target) {
  var that    = this;
  var status  = message.payload.status;
  return target.project.postJobs(status.runs.map(function(run) {
    var result = {
      project:            target.project.project,
      revision_hash:      target.revisionHash,
      job: {
        job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
        build_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        machine_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        name:             task.metadata.name,
        reason:           'scheduled',  // use reasonCreated or reasonResolved
        job_symbol:       task.extra.treeherder.symbol,
        group_name:       task.extra.treeherder.groupName,
        group_symbol:     task.extra.treeherder.groupSymbol,
        product_name:     task.extra.treeherder.productName,
        submit_timestamp: timestamp(run.scheduled),
        start_timestamp:  (run.started ? timestamp(run.started) : undefined),
        end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
        state:            stateFromRun(run),
        result:           resultFromRun(run),
        who:              task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };
    // If this is the new run added, we include link to inspector
    if (message.payload.runId === run.runId) {
      // Add link to task-inspector
      var inspectorLink = "http://docs.taskcluster.net/tools/task-inspector/#" +
                          status.taskId + "/" + run.runId;
      result.job.artifacts = [{
        type:     'json',
        name:     "Job Info",
        blob: {
          job_details: [{
            url:            inspectorLink,
            value:          "Inspect Task",
            content_type:   "link",
            title:          "Inspect Task"
          }]
        }
      }];
    }
    return result;
  }));
};

/** Handle notifications of running task */
Handlers.prototype.running = function(message, task, target) {
  var that    = this;
  var status  = message.payload.status;
  return target.project.postJobs(status.runs.map(function(run) {
    var result = {
      project:            target.project.project,
      revision_hash:      target.revisionHash,
      job: {
        job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
        build_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        machine_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        name:             task.metadata.name,
        reason:           'scheduled',  // use reasonCreated or reasonResolved
        job_symbol:       task.extra.treeherder.symbol,
        group_name:       task.extra.treeherder.groupName,
        group_symbol:     task.extra.treeherder.groupSymbol,
        product_name:     task.extra.treeherder.productName,
        submit_timestamp: timestamp(run.scheduled),
        start_timestamp:  (run.started ? timestamp(run.started) : undefined),
        end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
        state:            stateFromRun(run),
        result:           resultFromRun(run),
        who:              task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };
    // If this is the run that started, we include logs
    if (message.payload.runId === run.runId) {

      // Add link to task-inspector, again, treeherder is obscure, it doesn't
      // pick it up the first time....
      var inspectorLink = "http://docs.taskcluster.net/tools/task-inspector/#" +
                          status.taskId + "/" + run.runId;
      result.job.artifacts = [{
        type:     'json',
        name:     "Job Info",
        blob: {
          job_details: [{
            url:            inspectorLink,
            value:          "Inspect Task",
            content_type:   "link",
            title:          "Inspect Task"
          }]
        }
      }];
    }
    return result;
  }));
};

/** Handle notifications of completed task */
Handlers.prototype.completed = function(message, task, target) {
  var that    = this;
  var status  = message.payload.status;
  return target.project.postJobs(status.runs.map(function(run) {
    var result = {
      project:            target.project.project,
      revision_hash:      target.revisionHash,
      job: {
        job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
        build_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        machine_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        name:             task.metadata.name,
        reason:           'scheduled',  // use reasonCreated or reasonResolved
        job_symbol:       task.extra.treeherder.symbol,
        group_name:       task.extra.treeherder.groupName,
        group_symbol:     task.extra.treeherder.groupSymbol,
        product_name:     task.extra.treeherder.productName,
        submit_timestamp: timestamp(run.scheduled),
        start_timestamp:  (run.started ? timestamp(run.started) : undefined),
        end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
        state:            stateFromRun(run),
        result:           resultFromRun(run),
        who:              task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };

    // The log must only be set after the task is completed and the log must
    // also be gzipped.
    result.job.log_references = [{
      name:   "live_backing.log",
      url:    that.queue.buildUrl(
                that.queue.getArtifact,
                status.taskId,
                run.runId,
                'public/logs/live_backing.log'
              )
    }];

    return result;
  }));
};

/** Handle notifications of failed task */
Handlers.prototype.failed = function(message, task, target) {
  var that    = this;
  var status  = message.payload.status;
  return target.project.postJobs(status.runs.map(function(run) {
    return {
      project:            target.project.project,
      revision_hash:      target.revisionHash,
      job: {
        job_guid:         slugid.decode(status.taskId) + '/' + run.runId,
        build_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        machine_platform: {
            platform:     status.workerType,
            os_name:      '-',
            architecture: '-'
        },
        name:             task.metadata.name,
        reason:           'scheduled',  // use reasonCreated or reasonResolved
        job_symbol:       task.extra.treeherder.symbol,
        group_name:       task.extra.treeherder.groupName,
        group_symbol:     task.extra.treeherder.groupSymbol,
        product_name:     task.extra.treeherder.productName,
        submit_timestamp: timestamp(run.scheduled),
        start_timestamp:  (run.started ? timestamp(run.started) : undefined),
        end_timestamp:    (run.resolved ? timestamp(run.resolved) : undefined),
        state:            stateFromRun(run),
        result:           resultFromRun(run),
        who:              task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };
  }));
};

