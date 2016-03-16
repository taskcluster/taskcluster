var Promise       = require('promise');
var debug         = require('debug')('app:dependency-resolver');
var slugid        = require('slugid');
var assert        = require('assert');
var _             = require('lodash');
var base          = require('taskcluster-base');
var data          = require('./data');
var QueueService  = require('./queueservice');

/**
 * When a task is resolved, we put a message in the resolvedQueue, this class
 * polls the queue and calls DependencyTracker.resolveTask(...).
 *
 * This is just to offload dependency resolution to a background worker.
 */
class DependencyResolver {
  /**
   * options:
   * {
   *   dependencyTracker:   // DependencyTracker instance
   *   queueService:        // QueueService instance
   *   pollingDelay:        // Number of ms to sleep between polling
   *   parallelism:         // Number of polling loops to run in parallel
   *                        // Each handles up to 32 messages in parallel
   * }
   */
  constructor(options = {}) {
    assert(options,                   'options are required');
    assert(options.dependencyTracker, 'Expected options.dependencyTracker');
    assert(options.queueService,      'Expected options.queueService');
    assert(typeof(options.pollingDelay) === 'number',
           "Expected pollingDelay to be a number");
    assert(typeof(options.parallelism) === 'number',
           "Expected parallelism to be a number");

    // Set polling delay and parallelism
    this._pollingDelay  = options.pollingDelay;
    this._parallelism   = options.parallelism;

    // Promise that polling is done
    this._done          = null;
    // Boolean that polling should stop
    this._stopping      = false;
  }


  /** Start polling for resolved-task messages */
  start() {
    if (this._done) {
      return;
    }
    this._stopping = false;

    // Start a loop for the amount of parallelism desired
    let loops = [];
    for(var i = 0; i < this._parallelism; i++) {
      loops.push(this._pollResolvedTasks());
    }

    // Create promise that we're done looping
    this._done = Promise.all(loops).catch((err) => {
      debug("Error: %s, as JSON: %j", err, err, err.stack);
      throw err;
    }).then(() => {
      this._done = null;
    });
  }

  /** Terminate iteration, returns promise that polling is stopped */
  terminate() {
    this._stopping = true;
    return this._done;
  }

  /** Poll for messages and handle them in a loop */
  async _pollResolvedTasks() {
    while(!this._stopping) {
      let messages = await this.queueService.pollResolvedQueue();
      debug("Fetched %s messages", messages.length);

      await Promise.all(messages.map(async (m) => {
        // Don't let a single task error break the loop, it'll be retried later
        // as we don't remove message unless they are handled
        try {
          await this.dependencyTracker.resolveTask(m.taskId, m.resolution);
          await m.remove();
        } catch (err) {
          debug("[alert-operator] Failed to handle message: %j" +
                ", with err: %s, as JSON: %j", message, err, err, err.stack);
        }
      }));

      if(messages.length === 0 && !this._stopping) {
        await new Promise(accept => setTimeout(accept, this._pollingDelay));
      }
    }
  }
}

// Export DependencyResolver
module.exports = DependencyResolver;
