var assert  = require('assert');
var base    = require('taskcluster-base');
var data    = require('data');
var datejs  = require('date.js');
var Promise = require('promise');
var slugid  = require('slugid');

/**
 * The Scheduler will periodically check for tasks in azure storage that are
 * in need of scheduling, by polling at some periodic rate. Hooks that have
 * a defined schedule will be run if it's schedule is valid and the next
 * scheduled date is in the past.
 */
class Scheduler {
  /** Create a Scheduler instance.
   *
   * options:
   * {
   *   Hook:          // instance of data.Hook
   *   queue:         // instance of taskcluster-client.Queue
   *   pollingDelay:  // number of ms to sleep between polling
   * }
   * */
  constructor(options) {
    assert(options, "options must be given");
    assert(options.Hook.prototype instanceof data.Hook,
        "Expected data.Hook instance");
    assert(options.queue instanceof taskcluster.Queue,
        "An instance of taskcluster.Queue is required");
    assert(typeof(options.pollingDelay) == 'number',
        "Expected pollingDelay to be a number");
    // Store options on this for use in event handlers
    this.Hook         = options.Hook;
    this.queue        = options.queue;
    this.pollingDelay = options.pollingDelay;

    // Promise that the polling is done
    this.done         = null;

    // Boolean that the polling should stop
    this.stopping     = false;
  }

  /** Start polling */
  start() {
    if (this.done) {
      return;
    }
    this.stopping = false;

    // Create a promise that we're done looping
    this.done = poll().catch((err) => {
      debug("Error: %s, as JSON: %j", err, err, err.stack);
      throw err;
    }).then(() => {
      this.done = null;
    });
  }

  /** Terminate iteration, returns a promise that polling is stopped */
  terminate() {
    this.stopping = true;
    return this.done;
  }

  /** Polls for hooks that need to be scheduled and handles them in a loop */
  async poll() {
    while(!this.stopping) {
      // Get all hooks that have a schedule defined, and a scheduled date
      // that is less than the current time
      var hooks = await this.Hook.scan({
        schedule:           base.Entity.Op.notEqual(''),
        nextScheduledDate:  base.Entity.Op.lessThan(new Date())
      }, {});

      await Promise.all(hooks.entries.map((hook) => {
        // Don't let a single error break the loop, since it'll be retried later
        return this.handleHook(hook).catch((err) => {
          debug("Failed to handle hook: %j" +
              ", with err: %s, as JSON: %j", hook, err, err, err.stack);
        });
      }));

      await this.sleep(this.pollingDelay);
    }
  }

  /** Sleep for `delay` ms, returns a promise */
  sleep(delay) {
    return new Promise((accept) => { setTimeout(accept, delay); });
  }

  /** Handle spawning a new task for a given hook that needs to be scheduled */
  async handleHook(hook) {
    let task = await hook.taskPayload();
    let resp = await queue.createTask(hook.nextTaskId, task);
    await hook.modify((hook) => {
      hook.nextTaskId        = slugid();
      hook.nextScheduledDate = datejs(hook.schedule);
    });
  }
}

// Export Scheduler
module.exports = Scheduler
