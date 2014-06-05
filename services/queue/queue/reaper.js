var events  = require('events');
var util    = require('util');
var Promise = require('promise');
var _       = require('lodash');
var assert  = require('assert');
var debug   = require('debug')('queue:reaper');

/**
 * Create reaper that expires task by deadline and takenUntil at given interval.
 *
 * options:
 * {
 *   interval:   30 // Interval to cleanup in seconds
 *   errorLimit: 5  // Number of times reaping is allowed to fail in a row
 *   store:         // TaskStore from queue/taskstore.js
 *   publisher:     // publisher from base.Exchanges
 *   start:         // Start immediately (defaults to false)
 * }
 */
var Reaper = function(options) {
  events.EventEmitter.call(this);

  // Set options
  _.defaults(options, {
    interval:     30,
    errorLimit:   5
  });

  // Validate options
  assert(typeof(options.interval) === 'number' && options.interval > 0,
         "options.interval must be a positive number");
  assert(options.store, "store must be a TaskStore instance");
  assert(options.publisher, "publisher must be a provided");

  // Set properties
  this._store       = options.store;
  this._publisher   = options.publisher;
  this._interval    = options.interval;
  this._errorLimit  = options.errorLimit;
  this._errorCount  = 0;
  this._timeout = null;

  // Auto start reaper
  if (options.start) {
    this.start();
  }
};

// Inherit from events.EventEmitter
util.inherits(Reaper, events.EventEmitter);

/** Start reaping at interval */
Reaper.prototype.start = function() {
  var that = this;
  if (this._timeout !== null) {
    debug("Can't start reaping, when already started");
    return;
  }
  // Set timeout
  this._timeout = setTimeout(function() {
    that.reap().then(function() {
      // Reset error count
      that._errorCount = 0;
    }).catch(function(err) {
      that._errorCount += 1;
      // Rethrow error if we're above the limit
      if (that._errorCount > that._errorLimit) {
        debug("Error in reaper: %s, as JSON: %j", err, err, err.stack);
        throw err;
      } else {
        debug("Ignored error in reaper: %s, as JSON: %j", err, err, err.stack);
      }
    }).then(function() {
      // If not stopped, then clear timeout and set a new timeout
      if (that._timeout) {
        that._timeout = null;
        that.start();
      }
    }).catch(function(err) {
      debug("emitting error to provoke a crash");
      that._timeout = null;
      that.emit('error', err);
    });
  }, this._interval * 1000);
};

/** Stop reaping at interval */
Reaper.prototype.stop = function() {
  clearTimeout(this._timeout);
  this._timeout = null;
};

/** Reap tasks */
Reaper.prototype.reap = function() {
  var that = this;

  // Reap failed tasks
  var failedReaped = this._store.findAndUpdateFailed().then(function(tasks) {
    debug("failed tasks: " + tasks.length);
    return tasks.map(function(task) {
      debug("task failed: %s", task.taskId);
      // Construct message
      var message = {
        status:   task
      };

      // Add run information from latest run, if one exists
      task.runs.forEach(function(run) {
        if (!message.runId || message.runId < run.runId) {
          message.runId       = run.runId;
          message.workerGroup = run.workerGroup;
          message.workerId    = run.workerId;
        }
      });

      // Publish message
      return that._publisher.taskFailed(message);
    });
  });

  // Reap pending tasks
  var pendingReaped = that._store.findAndUpdatePending().then(function(tasks) {
    debug("pending tasks: " + tasks.length);
    return tasks.map(function(task) {
      debug("task pending: %s", task.taskId);
      // Publish event notifying about the new task
      return that._publisher.taskPending({
        status:     task
      });
    });
  });

  // Promise that both things are reaped
  return Promise.all(failedReaped, pendingReaped);
};

// Export reaper
module.exports = Reaper;
