let Promise       = require('promise');
let debug         = require('debug')('app:dependency-resolver');
let slugid        = require('slugid');
let assert        = require('assert');
let _             = require('lodash');
let base          = require('taskcluster-base');
let data          = require('./data');
let QueueService  = require('./queueservice');
let events        = require('events');

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
   *   monitor:             // base.monitor instance
   * }
   */
  constructor(options = {}) {
    assert(options,                   'options are required');
    assert(options.dependencyTracker, 'Expected options.dependencyTracker');
    assert(options.queueService,      'Expected options.queueService');
    assert(typeof options.pollingDelay === 'number',
           'Expected pollingDelay to be a number');
    assert(typeof options.parallelism === 'number',
           'Expected parallelism to be a number');
    assert(options.monitor !== null, 'options.monitor required!');

    // Remember options
    this.dependencyTracker  = options.dependencyTracker;
    this.queueService       = options.queueService;
    this.monitor            = options.monitor;

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
    for (var i = 0; i < this._parallelism; i++) {
      loops.push(this._pollResolvedTasks());
    }

    // Create promise that we're done looping
    this._done = Promise.all(loops).catch(async (err) => {
      console.log('Crashing the process: %s, as json: %j', err, err);
      // TODO: use this.monitor.reportError(err); when PR lands:
      // https://github.com/taskcluster/taskcluster-lib-monitor/pull/27
      await this.monitor.reportError(err, 'error', {}, true);
      // Crash the process
      process.exit(1);
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
    while (!this._stopping) {
      let messages = await this.queueService.pollResolvedQueue();
      this.monitor.count('resolved-queue-poll-requests', 1);
      this.monitor.count('resolved-queue-polled-messages', messages.length);
      debug('Fetched %s messages', messages.length);

      await Promise.all(messages.map(async (m) => {
        // Don't let a single task error break the loop, it'll be retried later
        // as we don't remove message unless they are handled
        try {
          await this.dependencyTracker.resolveTask(m.taskId, m.taskGroupId, m.resolution);
          await m.remove();
          this.monitor.count('handled-messages-success', 1);
        } catch (err) {
          this.monitor.count('handled-messages-error', 1);
          this.monitor.reportError(err, 'warning');
        }
      }));

      if (messages.length === 0 && !this._stopping) {
        // Count that the queue is empty, we should have this happen regularly.
        // otherwise, we're not keeping up with the messages. We can setup
        // alerts to notify us if this doesn't happen for say 40 min.
        this.monitor.count('resolved-queue-empty');
        await new Promise(accept => setTimeout(accept, this._pollingDelay));
      }
    }
  }
}

// Export DependencyResolver
module.exports = DependencyResolver;
