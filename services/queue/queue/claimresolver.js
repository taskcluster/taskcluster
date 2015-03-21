var Promise       = require('promise');
var debug         = require('debug')('queue:claimresolver');
var slugid        = require('slugid');
var assert        = require('assert');
var _             = require('lodash');
var base          = require('taskcluster-base');
var data          = require('./data');
var QueueService  = require('./queueservice');

/** State that are considered resolved */
const RESOLVED_STATES = [
  'completed',
  'failed',
  'exception'
];

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
   *   Task:           // instance of data.Task
   *   queueService:   // instance of QueueService
   *   publisher:      // publisher from base.Exchanges
   *   pollingDelay:   // Number of ms to sleep between polling
   *   parallelism:    // Number of polling loops to run in parallel
   *                   // Each handles up to 32 messages in parallel
   * }
   */
  constructor(options) {
    assert(options, "options must be given");
    assert(options.Task.prototype instanceof data.Task,
           "Expected data.Task instance");
    assert(options.queueService instanceof QueueService,
           "Expected instance of QueueService");
    assert(options.publisher, "Expected a publisher");
    assert(typeof(options.pollingDelay) === 'number',
           "Expected pollingDelay to be a number");
    assert(typeof(options.parallelism) === 'number',
           "Expected parallelism to be a number");
    this.Task         = options.Task;
    this.queueService = options.queueService;
    this.publisher    = options.publisher;
    this.pollingDelay = options.pollingDelay;
    this.parallelism  = options.parallelism;

    // Promise that polling is done
    this.done         = null;
    // Boolean that polling should stop
    this.stopping     = false;
  }

  /** Start polling */
  start() {
    if (this.done) {
      return;
    }
    this.stopping = false;

    // Start a loop for the amount of parallelism desired
    var loops = [];
    for(var i = 0; i < this.parallelism; i++) {
      loops.push(this.poll());
    }
    // Create promise that we're done looping
    this.done = Promise.all(loops).catch((err) => {
      debug("Error: %s, as JSON: %j", err, err, err.stack);
      throw err;
    }).then(() => {
      this.done = null;
    });
  }

  /** Terminate iteration, returns promise that polling is stopped */
  terminate() {
    this.stopping = true;
    return this.done;
  }

  /** Poll for messages and handle them in a loop */
  async poll() {
    while(!this.stopping) {
      var messages = await this.queueService.pollClaimQueue();
      debug("Fetched %s messages", messages.length);

      await Promise.all(messages.map((message) => {
        // Don't let a single task error break the loop, it'll be retried later
        // as we don't remove message unless they are handled
        return this.handleMessage(message).catch((err) => {
          debug("[alert-operator] Failed to handle message: %j" +
                ", with err: %s, as JSON: %j", message, err, err, err.stack);
        });
      }));

      if(messages.length === 0 && !this.stopping) {
        await this.sleep(this.pollingDelay);
      }
    }
  }

  /** Sleep for `delay` ms, returns a promise */
  sleep(delay) {
    return new Promise((accept) => { setTimeout(accept, delay); });
  }

  /** Handle advisory message about claim expiration */
  async handleMessage({taskId, runId, takenUntil, remove}) {
    // Query for entity for which we have exact rowKey too, limit to 1, and
    // require that takenUntil matches. This is essentially a conditional load
    // operation. Note, that this possible because we set takenUntil both in
    // the task.runs[runId].takenUntil property and in the task.takenUntil
    // property whenever a task is claimed, reclaimed. And task.takenUntil is
    // cleared whenever a run is resolved, so this conditional load should
    // significantly reduce the amount of task entities that we load.
    var {entries: [task]} = await this.Task.query({
      taskId:     taskId,     // Matches an exact entity
      takenUntil: takenUntil  // Load conditionally
    }, {
      matchRow:   'exact',    // Validate that we match row key exactly
      limit:      1           // Load at most one entity, no need to search
    });

    // If the task doesn't exist, we're done
    if (!task) {
      // don't log this as it's fairly common...
      return remove();
    }

    // Check if this is the takenUntil we're supposed to be resolving for, if
    // this check fails, then the conditional load must have failed so we should
    // alert operator!
    if (task.takenUntil.getTime() !== takenUntil.getTime()) {
      debug("[alert-operator] Task takenUntil doesn't match takenUntil from " +
            "message, taskId: %s, task.takenUntil: %s, message.takenUntil: %s ",
            taskId, task.takenUntil.toJSON(), takenUntil.toJSON());
      return remove();
    }

    // Ensure that all runs are resolved
    await task.modify((task) => {
      var run = task.runs[runId];
      if (!run) {
        // The run might not have been created, if the claimTask operation
        // failed
        debug("[not-a-bug] runId: %s does exists on taskId: %s, but " +
              "deadline message has arrived", runId, taskId);
        return;
      }

      // If the run isn't running, or takenUntil has been updated, then we're
      // done. Notice that unlike condition above, we're racing in the
      // task.modify modifier so reloads can happen if there is concurrency!
      // Hence, takenUntil being update is both valid and plausible.
      if (run.state !== 'running' ||
          new Date(run.takenUntil).getTime() !== takenUntil.getTime()) {
        return;
      }

      // If task deadline is exceeded we don't just have claim-expired we, have
      // deadline, expired... And we choose to forget about claim-expired
      if (task.deadline.getTime() <= Date.now()) {
        return;
      }

      // Update run
      run.state           = 'exception';
      run.reasonResolved  = 'claim-expired';
      run.resolved        = new Date().toJSON();

      // Do **NOT** clear takenUntil on task, as this will prevent the message
      // from running again. In case something below fails.

      // If the run isn't the last run, then something is very wrong
      if (task.runs.length - 1 !== runId) {
        debug("[alert-operator] running runId: %s, resolved exception, " +
              "but it wasn't the last run! taskId: ", runId, taskId);
        return;
      }

      // Add retry, if we have retries left
      if (task.retriesLeft > 0) {
        task.retriesLeft -= 1;
        task.runs.push({
          state:            'pending',
          reasonCreated:    'retry',
          scheduled:        new Date().toJSON()
        });
      }
    });

    // Find the run that we (may) have modified
    var run = task.runs[runId];

    // If run isn't resolved to exception with 'claim-expired', we had
    // concurrency and we're done.
    if (!run ||
        task.runs.length - 1  > runId + 1 ||
        run.state             !== 'exception' ||
        run.reasonResolved    !== 'claim-expired') {
      return remove();
    }

    var status = task.status();

    // If a newRun was created and it is a retry with state pending then we
    // better publish messages about it
    var newRun = task.runs[runId + 1];
    if (newRun &&
        task.runs.length - 1  === runId + 1 &&
        newRun.state          === 'pending' &&
        newRun.reasonCreated  === 'retry') {
      await Promise.all([
        this.queueService.putPendingMessage(task, runId + 1),
        this.publisher.taskPending({
          status:         status,
          runId:          runId + 1
        }, task.routes)
      ]);
    } else {
      // Publish message about task exception
      await this.publisher.taskException({
        status:       status,
        runId:        runId,
        workerGroup:  run.workerGroup,
        workerId:     run.workerId
      }, task.routes);
    }

    return remove();
  }
};

// Export ClaimResolver
module.exports = ClaimResolver;

