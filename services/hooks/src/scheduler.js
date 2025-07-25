import assert from 'assert';
import events from 'events';
import debugFactory from 'debug';
const debug = debugFactory('hooks:scheduler');
import taskcluster from '@taskcluster/client';
import nextDate from './nextdate.js';
import taskcreator from './taskcreator.js';
import { hookUtils } from './utils.js';

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
   *   taskcreator:   // instance of taskcreator.TaskCreator
   *   pollingDelay:  // number of ms to sleep between polling
   * }
   * */
  constructor(options) {
    super();
    assert(options, 'options must be given');
    assert(options.taskcreator instanceof taskcreator.TaskCreator,
      'An instance of taskcreator.TaskCreator is required');
    assert(options.monitor, 'a monitor is required');
    assert(typeof options.pollingDelay === 'number',
      'Expected pollingDelay to be a number');
    assert(options.db, 'db must be set');
    // Store options on this for use in event handlers
    this.taskcreator = options.taskcreator;
    this.notify = options.notify;
    this.pollingDelay = options.pollingDelay;
    this.db = options.db;
    this.monitor = options.monitor;

    // Promise that the polling is done
    this.done = null;

    // Boolean that the polling should stop
    this.stopping = false;
  }

  /** Start polling */
  start() {
    if (this.done) {
      return;
    }
    this.stopping = false;

    // Create a promise that we're done looping
    this.done = this.loopUntilStopped().catch((err) => {
      debug('Error: %s, as JSON: %j', err, err, err.stack);
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
    const hooks = (await this.db.fns.get_hooks(null, new Date(), null, null)).map(hookUtils.fromDb);

    await Promise.all(hooks.map(hook => this.handleHook(hook)));
  }

  /** Polls for hooks that need to be scheduled and handles them in a loop */
  async loopUntilStopped() {
    while (!this.stopping) {
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
    try {
      const nextTaskId = this.db.decrypt({ value: hook.nextTaskId }).toString('utf8');
      debug('firing hook %s/%s with taskId %s', hook.hookGroupId, hook.hookId, nextTaskId);
      try {
        await this.taskcreator.fire(hook, { firedBy: 'schedule' }, {
          taskId: nextTaskId,
          // use the next scheduled date as task.created, to ensure idempotency
          created: hook.nextScheduledDate,
          // don't retry, as a 5xx error will cause a retry on the next scheduler
          // polling interval, and we do not want to get behind waiting for each
          // createTask operation to time out
          retry: false,
        });
      } catch (err) {
        debug('Failed to handle hook: %s/%s, with err: %s', hook.hookGroupId, hook.hookId, err);

        // for 500's, pretend nothing happend and we'll try again on the next go-round.
        if (err.statusCode >= 500) {
          return;
        }

        // In the case of a 4xx error, retrying on the next scheduler loop is a
        // waste of time, so consider the hook fired (and failed)
        await this.sendFailureEmail(hook, err);
      }

      try {
        let oldTaskId = hook.nextTaskId;
        // only modify if another scheduler isn't racing with us
        if (hook.nextTaskId === oldTaskId) {
          hook = hookUtils.fromDbRows(
            await this.db.fns.update_hook(
              hook.hookGroupId,
              hook.hookId,
              null,
              null,
              null,
              null,
              null,
              this.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }), /* encrypted_next_task_id */
              nextDate(hook.schedule), /* next_scheduled_date */
              null,
            ),
          );
        }
      } catch (err) {
        debug('Failed to update hook (will re-fire): %s/%s, with err: %s', hook.hookGroupId, hook.hookId, err);
        return;
      }
    } catch (err) {
      // ensure that handleHook *never* throws an exception by logging and returning
      this.monitor.reportError(err);
    }
  }

  async sendFailureEmail(hook, err) {
    if (!hook.metadata.emailOnError) {
      return;
    }

    try {
      let errJson;
      try {
        errJson = JSON.stringify(err, null, 2);
      } catch (e) {
        errJson = `(error formatting JSON: ${e})`;
      }

      let email = this.createEmail(hook, err, errJson);
      await this.notify.email(email);
    } catch (err) {
      if (err.code === 'DenylistedAddress') {
        this.monitor.warning(`Hook failure email rejected: ${hook.metadata.owner} is denylisted`);
        return;
      }

      // report the error and pretend we sent the email
      this.monitor.reportError(err);
    }
  }

  createEmail(hook, err, errJson) {
    return {
      address: hook.metadata.owner,
      subject: `[Taskcluster Hooks] Scheduled Hook failure: ${hook.hookGroupId}/${hook.hookId}`,
      content: `The hooks service was unable to create a task for hook ${hook.hookGroupId}/${hook.hookId},
  for which you are listed as owner.

  The error was:
    ${err}

  Details:

    ${errJson}

  The service will try again to create the task on the next iteration.

  Thanks,
  Taskcluster Automation

  P.S. If you believe you have received this email in error, please hit reply to let us know.`,

    };
  }
}

// Export Scheduler
export default Scheduler;
