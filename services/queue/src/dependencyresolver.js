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
   *   monitor:             // base.monitor instance
   * }
   */
  constructor(options = {}) {
    assert(options, 'options are required');
    assert(options.dependencyTracker, 'Expected options.dependencyTracker');
    assert(options.queueService, 'Expected options.queueService');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(options.monitor !== null, 'options.monitor required!');
    assert(options.ownName, 'Must provide a name');

    // Remember options
    this.dependencyTracker = options.dependencyTracker;
    this.queueService = options.queueService;
    this.monitor = options.monitor;

    // Set polling delay
    this._pollingDelay = options.pollingDelay;

    // do iteration
    this.iterator = new Iterate({
      name: options.ownName,
      maxFailures: 10,
      waitTime: this._pollingDelay,
      monitor: this.monitor,
      maxIterationTime: 600 * 1000,
      handler: async () => this._pollResolvedTasks(),
    });

    this.iterator.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
  }

  /** Start polling for resolved-task messages */
  async start() {
    return this.iterator.start();
  }

  /** Terminate iteration, returns promise that polling is stopped */
  terminate() {
    return this.iterator.stop();
  }

  /** Poll for messages and handle them in a loop */
  async _pollResolvedTasks() {
    let messages = await this.queueService.pollResolvedQueue();
    let failed = 0;
    await Promise.all(messages.map(async (m) => {
      // Don't let a single task error break the loop, it'll be retried later
      // as we don't remove message unless they are handled
      try {
        await this.dependencyTracker.resolveTask(m.taskId, m.taskGroupId, m.schedulerId, m.resolution);
        await m.remove();
      } catch (err) {
        failed += 1;
        this.monitor.reportError(err, 'warning');
      }
    }));

    // If there were no messages, back off for a bit.  This avoids pounding
    // Azure repeatedly for empty queues, at the cost of some slight delay
    // to finding new messages in those queues.
    if (messages.length === 0) {
      await this.sleep(2000);
    }

    this.monitor.log.azureQueuePoll({
      messages: messages.length,
      failed,
      resolver: 'dependency',
    });
  }

  /** Sleep for `delay` ms, returns a promise */
  sleep(delay) {
    return new Promise((accept) => { setTimeout(accept, delay); });
  }
}

// Export DependencyResolver
module.exports = DependencyResolver;
