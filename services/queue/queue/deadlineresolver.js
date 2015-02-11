var Promise       = require('promise');
var debug         = require('debug')('queue:deadlineresolver');
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
 * Facade that handles resolution tasks by deadline, using the advisory messages
 * from the azure queue. The azure queue messages takes the form:
 * `{taskId, deadline}`, and they become visible after `deadline` has been
 * exceeded. The messages advice that if a task with the given `deadline` and
 * `taskId` exists, then it be resolved by deadline, if not already resolved.
 *
 * Notice, that the task may not exists. Or the task may have different
 * `deadline`, we shall only handle task if the `deadline` match.
 */
class DeadlineResolver {
  /**
   * Create DeadlineResolver instance.
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
    this.done = Promise.all(loops).then(() => {
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
      var messages = await this.queueService.pollDeadlineQueue();

      await Promise.all(messages.map((message) => {
        this.handleMessage(message);
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

  /** Handle advisory message about deadline expiration */
  async handleMessage({taskId, deadline, remove}) {
    // Query for entity for which we have exact rowKey too, limit to 1, and
    // require that deadline matches. This is essentially a conditional load
    // operation
    var {entries: [task]} = await this.Task.query({
      taskId:     taskId,   // Matches an exact entity
      deadline:   deadline  // Load conditionally
    }, {
      matchRow:   'exact',  // Validate that we match row key exactly
      limit:      1         // Load at most one entity, no need to search
    });

    // If the task doesn't exist, we'll log and be done, it's an interesting
    // metric that's all
    if (!task) {
      debug("[not-a-bug] Task doesn't exist, taskId: %s, deadline: %s",
            taskId, deadline.toJSON());
      return remove();
    }

    // Check if this is the deadline we're supposed to be resolving for, if
    // this check fails, then the conditional load must have failed so we should
    // alert operator!
    if (task.deadline.getTime() !== deadline.getTime()) {
      debug("[alert-operator] Task deadline doesn't match deadline from " +
            "message, taskId: %s, task.deadline: %s, message.deadline: %s ",
            taskId, task.deadline.toJSON(), deadline.toJSON());
      return remove();
    }

    // Ensure that all runs are resolved
    await task.modify((task) => {
      if (task.runs.length === 0) {
        var now = new Date().toJSON();
        task.runs.push({
          state:            'exception',
          reasonCreated:    'scheduled',
          reasonResolved:   'deadline-exceeded',
          scheduled:        now,
          resolved:         now
        });
      }

      task.runs.forEach((run, runId) => {
        // don't modify resolved runs
        if (_.includes(RESOLVED_STATES, task.state())) {
          return;
        }
        // Resolve run as deadline-exceeded
        run.state           = 'exception';
        run.reasonResolved  = 'deadline-exceeded';
        run.resolved        = new Date().toJSON();
      });

      // Clear takenUntil, for ClaimResolver
      task.takenUntil       = new Date(0);
    });

    // Publish messages about runs that was resolved here
    var n = task.runs.length;
    for(var i = 0; i < n; i++) {
      var run = task.runs[i];
      // Skip runs that wasn't resolved 'deadline-exceeded'
      if (run.reasonResolved  !== 'deadline-exceeded' ||
          run.state           !== 'exception') {
        continue;
      }
      debug("Resolved taskId: %s, by deadline", taskId);
      await this.publisher.taskException({
        status:   task.status(),
        runId:    i
      });
    }

    return remove();
  }
};

// Export DeadlineResolver
module.exports = DeadlineResolver;

