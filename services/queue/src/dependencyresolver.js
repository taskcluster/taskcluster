let debug = require('debug')('app:dependency-resolver');
let assert = require('assert');
let Iterate = require('taskcluster-lib-iterate');

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
    assert(options, 'options are required');
    assert(options.dependencyTracker, 'Expected options.dependencyTracker');
    assert(options.queueService, 'Expected options.queueService');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(typeof options.parallelism === 'number',
      'Expected parallelism to be a number');
    assert(options.monitor !== null, 'options.monitor required!');

    // Remember options
    this.dependencyTracker = options.dependencyTracker;
    this.queueService = options.queueService;
    this.monitor = options.monitor;

    // Set polling delay and parallelism
    this._pollingDelay = options.pollingDelay;
    this._parallelism = options.parallelism;

    // do iteration
    const pollingDelaySecs = this._pollingDelay / 1000;
    const maxIterationTimeSecs = 600;
    this.iterator = new Iterate({
      maxFailures: 10,
      waitTime: pollingDelaySecs,
      watchDog: maxIterationTimeSecs + 1, // disable watchdog
      monitor: this.monitor,
      maxIterationTime: maxIterationTimeSecs,
      handler: async () => {
        let loops = [];
        for (let i = 0; i < this._parallelism; i++) {
          loops.push(this._pollResolvedTasks());
        }
        await Promise.all(loops);
      },
    });
  }

  /** Start polling for resolved-task messages */
  async start() {
    return new Promise((res, rej) => {
      this.iterator.once('started', res);
      this.iterator.start();
    });
  }

  /** Terminate iteration, returns promise that polling is stopped */
  async terminate() {
    return new Promise((res, rej) => {
      this.iterator.once('stopped', res);
      this.iterator.stop();
    });
  }

  /** Poll for messages and handle them in a loop */
  async _pollResolvedTasks() {
    let messages = await this.queueService.pollResolvedQueue();
    this.monitor.count('resolved-queue-poll-requests', 1);
    this.monitor.count('resolved-queue-polled-messages', messages.length);
    debug('Fetched %s messages', messages.length);

    await Promise.all(messages.map(async (m) => {
      // Don't let a single task error break the loop, it'll be retried later
      // as we don't remove message unless they are handled
      try {
        await this.dependencyTracker.resolveTask(m.taskId, m.taskGroupId, m.schedulerId, m.resolution);
        await m.remove();
        this.monitor.count('handled-messages-success', 1);
      } catch (err) {
        this.monitor.count('handled-messages-error', 1);
        this.monitor.reportError(err, 'warning');
      }
    }));

    if (messages.length === 0) {
      // Count that the queue is empty, we should have this happen regularly.
      // otherwise, we're not keeping up with the messages. We can setup
      // alerts to notify us if this doesn't happen for say 40 min.
      this.monitor.count('resolved-queue-empty');
    }
  }
}

// Export DependencyResolver
module.exports = DependencyResolver;
