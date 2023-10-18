import assert from 'assert';
import Iterate from 'taskcluster-lib-iterate';
import { sleep } from './utils.js';

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
   *   count:               // Number of records to fetch at a time
   *   monitor:             // base.monitor instance
   * }
   */
  constructor(options = {}) {
    assert(options, 'options are required');
    assert(options.dependencyTracker, 'Expected options.dependencyTracker');
    assert(options.queueService, 'Expected options.queueService');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(typeof options.count === 'number',
      'Expected count to be a number');
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
    let messages = await this.queueService.pollResolvedQueue(this.count);
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

    // If there were no messages, back off for a bit.
    if (messages.length === 0) {
      await sleep(1000);
    }

    this.monitor.log.queuePoll({
      count: messages.length,
      failed,
      resolver: 'dependency',
    });
  }
}

// Export DependencyResolver
export default DependencyResolver;
