var assert      = require('assert');
var events      = require('events');
var base        = require('taskcluster-base');
var data        = require('./data');
var debug       = require('debug')('hooks:scheduler');
var Promise     = require('promise');
var taskcluster = require('taskcluster-client');
var nextDate    = require('./nextdate');
var taskcreator = require('./taskcreator');

/**
 * The Scheduler will periodically check for tasks in azure storage that are
 * in need of scheduling, by polling at some periodic rate. Hooks that have
 * a defined schedule will be run if it's schedule is valid and the next
 * scheduled date is in the past.
 */
class Scheduler extends events.EventEmitter {
  /** Create a Scheduler instance.
   *
   * options:
   * {
   *   Hook:          // instance of data.Hook
   *   taskcreator:   // instance of taskcreator.TaskCreator
   *   pollingDelay:  // number of ms to sleep between polling
   * }
   * */
  constructor(options) {
    super();
    assert(options, "options must be given");
    assert(options.Hook.prototype instanceof data.Hook,
        "Expected data.Hook instance");
    assert(options.taskcreator instanceof taskcreator.TaskCreator,
        "An instance of taskcreator.TaskCreator is required");
    assert(typeof(options.pollingDelay) == 'number',
        "Expected pollingDelay to be a number");
    // Store options on this for use in event handlers
    this.Hook         = options.Hook;
    this.taskcreator  = options.taskcreator;
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
    this.done = this.loopUntilStopped().catch((err) => {
      debug("Error: %s, as JSON: %j", err, err, err.stack);
      this.emit('error', err);
    }).then(() => {
      this.done = null;
    });
  }

  /** Terminate iteration, returns a promise that polling is stopped */
  terminate() {
    this.stopping = true;
    return this.done;
  }

  async poll() {
    // Get all hooks that have a scheduled date that is earlier than now
    var hooks = await this.Hook.scan({
      nextScheduledDate:  base.Entity.op.lessThan(new Date())
    }, {
      limit: 100,
      handler: (hook) => this.handleHook(hook),
    });
  }

  /** Polls for hooks that need to be scheduled and handles them in a loop */
  async loopUntilStopped() {
    while(!this.stopping) {
      await this.poll();
      await this.sleep(this.pollingDelay);
    }
  }

  /** Sleep for `delay` ms, returns a promise */
  sleep(delay) {
    return new Promise(accept => setTimeout(accept, delay));
  }

  /** Handle spawning a new task for a given hook that needs to be scheduled */
  async handleHook(hook) {
    // TODO: (when we have hook logging) if this fails due to 401, we should
    // still consider it scheduled
    try {
      await this.taskcreator.fire(hook, {}, {
        taskId: hook.nextTaskId,
        // use the next scheduled date as task.created, to ensure idempotency
        created: hook.nextScheduledDate
      });
    } catch(err) {
      debug("Failed to handle hook: %j" +
            ", with err: %s, as JSON: %j", hook, err, err, err.stack);
      return;
    }

    try {
      let oldTaskId = hook.nextTaskId;
      await hook.modify((hook) => {
        // only modify if another scheduler isn't racing with us
        if (hook.nextTaskId === oldTaskId) {
            hook.nextTaskId        = taskcluster.slugid();
            hook.nextScheduledDate = nextDate(hook.schedule);
        }
      });
    } catch(err) {
      debug("Failed to update hook (will re-fire): %j" +
            ", with err: %s, as JSON: %j", hook, err, err, err.stack);
      return;
    }
  }
}

// Export Scheduler
module.exports = Scheduler
