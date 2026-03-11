import debugFactory from 'debug';
const debug = debugFactory('app:deadline-resolver');
import assert from 'assert';
import _ from 'lodash';
import QueueService from './queueservice.js';
import Iterate from '@taskcluster/lib-iterate';
import { Task } from './data.js';
import { sleep, splitTaskQueueId } from './utils.js';

/**
 * Facade that handles resolution tasks by deadline, using the advisory messages
 * from the deadline queue. The deadline queue messages takes the form:
 * `{taskId, deadline}`, and they become visible after `deadline` has been
 * exceeded. The messages advice that if a task with the given `deadline` and
 * `taskId` exists, then it be resolved by deadline, if not already resolved.
 *
 * Notice, that the task may not exists. Or the task may have different
 * `deadline`, we shall only handle task if the `deadline` match.
 *
 * The deadline message serves 3 purposes:
 * A) Resolve old tasks
 * B) Resolve tasks that failed to create properly
 * C) publish message about task-group finished.
 */
class DeadlineResolver {
  /**
   * Create DeadlineResolver instance.
   *
   * options:
   * {
   *   queueService:      // instance of QueueService
   *   dependencyTracker: // instance of DependencyTracker
   *   publisher:         // publisher from base.Exchanges
   *   pollingDelay:      // Number of ms to sleep between polling
   *   count:             // Number of messages to fetch in each poll
   *   parallelism:       // Number of polling loops to run in parallel
   *                      // Each handles up to `count` messages in parallel
   *   monitor:           // base.monitor instance
   * }
   */
  constructor(options) {
    assert(options, 'options must be given');
    assert(options.db, 'Expected db');
    assert(options.queueService instanceof QueueService,
      'Expected instance of QueueService');
    assert(options.dependencyTracker, 'Expected a DependencyTracker instance');
    assert(options.publisher, 'Expected a publisher');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(typeof options.parallelism === 'number',
      'Expected parallelism to be a number');
    assert(typeof options.count === 'number',
      'Expected count to be a number');
    assert(options.monitor !== null, 'options.monitor required!');
    assert(options.ownName, 'Must provide a name');
    this.db = options.db;
    this.queueService = options.queueService;
    this.dependencyTracker = options.dependencyTracker;
    this.publisher = options.publisher;
    this.pollingDelay = options.pollingDelay;
    this.parallelism = options.parallelism;
    this.count = options.count;
    this.monitor = options.monitor;

    this.iterator = new Iterate({
      name: options.ownName,
      maxFailures: 10,
      waitTime: this.pollingDelay,
      monitor: this.monitor,
      maxIterationTime: 601 * 1000,
      handler: async () => {
        let loops = [];
        for (let i = 0; i < this.parallelism; i++) {
          loops.push(this.poll());
        }
        await Promise.all(loops);
      },
    });

    this.iterator.on('error', () => {
      this.monitor.alert('iteration failed repeatedly; terminating process');
      process.exit(1);
    });
  }

  /** Start polling */
  async start() {
    return this.iterator.start();
  }

  /** Terminate iteration, returns promise that polling is stopped */
  terminate() {
    return this.iterator.stop();
  }

  /** Poll for messages and handle them in a loop */
  async poll() {
    let messages = await this.queueService.pollDeadlineQueue(this.count);
    let failed = 0;

    await Promise.all(messages.map(async (message) => {
      // Don't let a single task error break the loop, it'll be retried later
      // as we don't remove message unless they are handled
      try {
        await this.handleMessage(message);
      } catch (err) {
        failed += 1;
        this.monitor.reportError(err, 'warning');
      }
    }));

    // If there were no messages, back off for a bit.
    if (messages.length === 0) {
      await sleep(2000);
    }

    this.monitor.log.queuePoll({
      count: messages.length,
      failed,
      resolver: 'deadline',
    });
  }

  /** Handle advisory message about deadline expiration */
  async handleMessage({ taskId, taskGroupId, schedulerId, deadline, remove }) {
    const task = await Task.get(this.db, taskId);

    // If the task doesn't exist, or if the deadline has changed, then we're done
    if (!task || task.deadline.getTime() !== deadline.getTime()) {
      await this.dependencyTracker.updateTaskGroupActiveSet(taskId, taskGroupId, schedulerId);
      return remove();
    }

    task.updateStatusWith(await this.db.fns.cancel_task(taskId, 'deadline-exceeded'));

    // Check if the last run was resolved here (or possibly by a previous
    // attempt to process this message)
    let run = _.last(task.runs);
    if (run.reasonResolved === 'deadline-exceeded' &&
        run.state === 'exception') {
      debug('Resolved taskId: %s, by deadline', taskId);

      // Update dependency tracker
      await this.dependencyTracker.resolveTask(taskId, task.taskGroupId, task.schedulerId, 'exception');

      // Publish messages about the last run
      const runId = task.runs.length - 1;
      await this.publisher.taskException({
        status: task.status(),
        runId,
        task: { tags: task.tags || {} },
      }, task.routes);
      this.monitor.log.taskException({ taskId, runId });

      const metricLabels = splitTaskQueueId(task.taskQueueId);
      this.monitor.metric.exceptionTasks(1, {
        ...metricLabels,
        reasonResolved: run.reasonResolved,
      });

      // Task should no longer be available in the pending queue
      await this.queueService.removePendingMessage(taskId, runId);
    }

    return remove();
  }
}

// Export DeadlineResolver
export default DeadlineResolver;
