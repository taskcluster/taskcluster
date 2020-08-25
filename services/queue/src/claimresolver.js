const assert = require('assert');
const QueueService = require('./queueservice');
const Iterate = require('taskcluster-lib-iterate');
const { Task } = require('./data');

/**
 * Facade that handles resolution of claims by takenUntil, using the advisory
 * messages from the azure queue. The azure queue messages takes the form:
 * `{taskId, runId, takenUntil}`, and they become visible after `takenUntil`
 * has been exceeded. The messages advice that if a task with the given
 * `takenUntil` and `taskId` exists, then `runId` maybe need to be resolved by
 * `claim-expired` and the task retried (depending on `retriesLeft`).
 *
 * Notice, that the task may not exists, or may not have a the given run, or
 * it may be the case that the `takenUntil` doesn't match. These should be
 * ignored as it implies a failed request (which wasn't retried) or a run
 * that was reclaimed.
 */
class ClaimResolver {
  /**
   * Create ClaimResolver instance.
   *
   * options:
   * {
   *   queueService:      // instance of QueueService
   *   dependencyTracker: // instance of DependencyTracker
   *   publisher:         // publisher from base.Exchanges
   *   pollingDelay:      // Number of ms to sleep between polling
   *   parallelism:       // Number of polling loops to run in parallel
   *                      // Each handles up to 32 messages in parallel
   *   monitor:           // base.monitor instance
   * }
   */
  constructor(options) {
    assert(options, 'options must be given');
    assert(options.db, 'options must include db');
    assert(options.queueService instanceof QueueService,
      'Expected instance of QueueService');
    assert(options.dependencyTracker, 'Expected a DependencyTracker instance');
    assert(options.publisher, 'Expected a publisher');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(typeof options.parallelism === 'number',
      'Expected parallelism to be a number');
    assert(options.monitor !== null, 'options.monitor required!');
    assert(options.ownName, 'Must provide a name');
    this.db = options.db;
    this.queueService = options.queueService;
    this.dependencyTracker = options.dependencyTracker;
    this.publisher = options.publisher;
    this.pollingDelay = options.pollingDelay;
    this.parallelism = options.parallelism;
    this.monitor = options.monitor;

    this.iterator = new Iterate({
      name: options.ownName,
      maxFailures: 10,
      waitTime: this.pollingDelay,
      monitor: this.monitor,
      maxIterationTime: 600 * 1000,
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
    let messages = await this.queueService.pollClaimQueue();
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

    // If there were no messages, back of for a bit.  This avoids pounding
    // Azure repeatedly for empty queues, at the cost of some slight delay
    // to finding new messages in those queues.
    if (messages.length === 0) {
      await this.sleep(2000);
    }

    this.monitor.log.azureQueuePoll({
      messages: messages.length,
      failed,
      resolver: 'claim',
    });
  }

  /** Sleep for `delay` ms, returns a promise */
  sleep(delay) {
    return new Promise(accept => setTimeout(accept, delay));
  }

  /** Handle advisory message about claim expiration */
  async handleMessage({ taskId, runId, takenUntil, remove }) {
    const task = await Task.get(this.db, taskId);

    // If the task doesn't exist, we're done
    if (!task) {
      // don't log this as it's fairly common...
      return remove();
    }

    task.updateStatusWith(await this.db.fns.check_task_claim(taskId, runId, takenUntil));

    // Find the run that we (may) have modified, or that may have been
    // modified in a previous attempt to process this message that failed
    // before reaching remove() below.  In either case, we will publish
    // messages about it, in keeping with the at-least-once semantics of
    // TC's messages.
    let run = task.runs[runId];

    // If run isn't resolved to exception with 'claim-expired', we had
    // concurrency and we're done.
    if (!run ||
        task.runs.length - 1 > runId + 1 ||
        run.state !== 'exception' ||
        run.reasonResolved !== 'claim-expired') {
      return remove();
    }

    let status = task.status();

    // If a newRun was created and it is a retry with state pending then we
    // better publish messages about it
    let newRun = task.runs[runId + 1];
    if (newRun &&
        task.runs.length - 1 === runId + 1 &&
        newRun.state === 'pending' &&
        newRun.reasonCreated === 'retry') {
      await Promise.all([
        this.queueService.putPendingMessage(task, runId + 1),
        this.publisher.taskPending({
          status: status,
          runId: runId + 1,
        }, task.routes),
      ]);
      this.monitor.log.taskPending({ taskId, runId: runId + 1 });
    } else {
      // Update dependencyTracker
      await this.dependencyTracker.resolveTask(taskId, task.taskGroupId, task.schedulerId, 'exception');

      // Publish message about task exception
      await this.publisher.taskException({
        status: status,
        runId: runId,
        workerGroup: run.workerGroup,
        workerId: run.workerId,
      }, task.routes);
      this.monitor.log.taskException({ taskId, runId });
    }

    return remove();
  }
}

// Export ClaimResolver
module.exports = ClaimResolver;
