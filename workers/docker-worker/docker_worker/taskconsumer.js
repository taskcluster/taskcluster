var util          = require('util');
var Promise       = require('promise');
var EventEmitter  = require('events').EventEmitter;
var assert        = require('assert');
var runTask       = require('./runtask');
var debug         = require('debug')('taskcluster-docker-worker:TaskConsumer');

/** Interval with which we should poll for work when idle */
var POLLING_INTERVAL = 30 * 1000;

/**
 * Create a new TaskConsumer with the following options:
 *      {
 *        capacity:   // Instance of capacity
 *        docker:     // Docker handle
 *        worker:     // An instance of Worker
 *        interval:   // Optional, polling interval
 *      }
 *
 * This class emits the following events:
 *   - `error`, with an unhandled error as argument,
 *   - `taskClaimed` with a `TaskRun` instance as argument, and
 *   - `idleCapacity` with an instance of capacity as argument.
 *
 * These arguments are useful for monitoring the TaskConsumer, in particular
 * `idleCapacity` could be used to shutdown the worker when no tasks are
 * running.
 */
var TaskConsumer = function(options) {
  // Construct superclass
  EventEmitter.call(this);

  // Check options
  assert(options.docker,    'passes docker');
  assert(options.capacity,  'passes capacity');
  assert(options.worker,    'passes worker');

  // Keep options
  this.interval = options.interval || POLLING_INTERVAL;
  this.capacity = options.capacity;
  this.docker   = options.docker;
  this.worker   = options.worker;

  // Bind methods for simplicity
  var that = this;
  [
    'onError',
    'sleep',
    'poll',
    'onTaskClaimed'
  ].forEach(function(method) {
    that[method] = that[method].bind(that);
  });

  // Bind onError and onTaskClaimed
  this.on('error',        this.onError);
  this.on('taskClaimed',  this.onTaskClaimed);

  // Auxiliary state
  this._sleepTimer = null;
};

// Inherit from EventEmitter
util.inherits(TaskConsumer, EventEmitter);


/** Log unexpected errors */
TaskConsumer.prototype.onError = function(err) {
  debug('error processing message', err, err.stack);
};


/** Sleep and then poll for work again */
TaskConsumer.prototype.sleep = function() {
  debug('wait for message', this.interval);
  if (this._sleepTimer !== null) {
    clearTimeout(this._sleepTimer);
    this._sleepTimer = null;
  }
  this._sleepTimer = setTimeout(this.poll, this.interval);
};


/** Poll for work, if not started, this will initialize task consumption */
TaskConsumer.prototype.poll = function() {
  // the total number of tasks we can run in parallel
  var available = this.capacity.available;
  debug('polling - current capacity', available);

  // if we can't run anything right now then wait for capacity
  if (available <= 0) {
    debug('zero capacity waiting...');
    return this.capacity.once('pop', this.poll);
  }

  debug('attempt to fetch', available, 'off the queue');

  // Claim worker form the queue
  var that = this;
  this.worker.claimWork().then(function(taskRun) {
    if (taskRun) {
      that.emit('taskClaimed', taskRun);
      process.nextTick(that.poll);
    } else {
      that.emit('idleCapacity', that.capacity);
      that.sleep();
    }
  }).catch(function(err) {
    // Report unhandled error
    that.emit('error', err);
    //TODO: Have some sort of error threshold, right now we just schedule
    //      another poll. But we shouldn't do this if we have many errors...
    // Sleep a while before we try again
    that.sleep();
  });
};


/** Handle a claimed task, by running it */
TaskConsumer.prototype.onTaskClaimed = function(taskRun) {
  // Run the task
  var taskCompleted = runTask(taskRun, this.docker);

  // If there is an error, we should report it...
  var that = this;
  taskCompleted = taskCompleted.then(undefined, function(err) {
    // TODO: Add an error threshold!!!
    that.emit('error', err);
  });

  // Decrement capacity for duration of task
  this.capacity.push(taskCompleted);
};


// Export the TaskConsumer
module.exports = TaskConsumer;