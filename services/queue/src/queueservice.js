let _ = require('lodash');
let debug = require('debug')('app:queue');
let assert = require('assert');
let slugid = require('slugid');
const taskcluster = require('taskcluster-client');

/** Get seconds until `target` relative to now (by default).  This rounds up
 * and always waits at least one second, to avoid races in tests where
 * everything happens in a matter of milliseconds. */
let secondsTo = (target, relativeTo = new Date()) => {
  let delta = Math.ceil((target.getTime() - relativeTo.getTime()) / 1000);
  return Math.max(delta, 1);
};

/** Priority to constant number */
const PRIORITY_TO_CONSTANT = {
  highest: 7,
  'very-high': 6,
  high: 5,
  medium: 4,
  low: 3,
  'very-low': 2,
  lowest: 1,
};
_.forIn(PRIORITY_TO_CONSTANT, v => assert(typeof v === 'number'));

/** Priority in order of priority from high to low */
const PRIORITIES = [
  'highest',
  'very-high',
  'high',
  'medium',
  'low',
  'very-low',
  'lowest',
];
assert(_.xor(PRIORITIES, _.keys(PRIORITY_TO_CONSTANT)).length === 0);

const MESSAGE_FREEZE_TIMEOUT = '5 minutes';

/**
 * Utility class for managing task lifecycle queues.
 */
class QueueService {
  /**
   * options:
   * {
   *   db:                   // tc-lib-postgres Database
   *   deadlineDelay:        // ms before deadline expired messages arrive
   *   monitor:              // base.monitor instance
   * }
   */
  constructor(options) {
    assert(options, 'options is required');
    assert(options.db, 'db is required');
    assert(options.monitor, 'A monitor instance must be given');
    options = _.defaults({}, options, {
      deadlineDelay: 10 * 60 * 1000,
    });

    this.monitor = options.monitor;
    this.db = options.db;
    this.deadlineDelay = options.deadlineDelay;
  }

  terminate() {
  }

  /** Enqueue message to become visible when claim has expired */
  async putClaimMessage(taskId, runId, takenUntil, taskQueueId, workerGroup, workerId) {
    assert(taskId, 'taskId must be given');
    assert(taskQueueId, 'taskQueueId must be given');
    assert(workerGroup, 'workerGroup must be given');
    assert(workerId, 'workerId must be given');
    assert(typeof runId === 'number', 'runId must be a number');
    assert(takenUntil instanceof Date, 'takenUntil must be a date');
    assert(isFinite(takenUntil), 'takenUntil must be a valid date');

    await this.db.fns.queue_claimed_task_put(
      taskId,
      runId,
      takenUntil.toJSON(),
      taskQueueId,
      workerGroup,
      workerId,
    );
  }

  /**
   * Poll claim expiration queue, returns promise for list of message objects
   * on the form:
   *
   * ```js
   * [
   *   {
   *     taskId:      '<taskId>',     // Task to check
   *     runId:       <runId>,        // runId to expire claim on
   *     takenUntil:  [Date object],  // claim-expiration when submitted
   *     remove:      function() {},  // Delete message call when handled
   *   },
   *   ... // up-to to 32 objects in one list
   * ]
   * ```
   *
   * Note, messages must be handled within 10 minutes.
   */
  async pollClaimQueue(count = 32) {
    // if message is not processed on time, different handler will pick it up after timeout
    // if it is processed, it would be removed from the table
    const hideUntil = taskcluster.fromNow(MESSAGE_FREEZE_TIMEOUT);

    const rows = await this.db.fns.queue_claimed_task_get(hideUntil, count);
    return rows.map(({
      task_id: taskId,
      run_id: runId,
      taken_until,
      pop_receipt,
    }) => ({
      taskId,
      runId,
      takenUntil: new Date(taken_until),
      remove: async () => this.db.fns.queue_claimed_task_delete(taskId, pop_receipt),
    }));
  }

  /**
   * Enqueue message ensure the dependency resolver handles the resolution.
   * This is being called whenever task is resolved as completed or failed.
   *
   * At this moment we can also drop record from the claim and deadline queues,
   * since the task was resolved.
   */
  async putResolvedMessage(taskId, taskGroupId, schedulerId, resolution, runId = 0) {
    assert(taskId, 'taskId must be given');
    assert(taskGroupId, 'taskGroupId must be given');
    assert(schedulerId, 'schedulerId must be given');
    assert(resolution === 'completed' || resolution === 'failed' ||
      resolution === 'exception',
    'resolution must be completed, failed or exception');

    await Promise.allSettled([
      this.db.fns.queue_resolved_task_put(
        taskGroupId,
        taskId,
        schedulerId,
        resolution,
      ),
      this.db.fns.queue_claimed_task_resolved(taskId, runId),
    ]);
  }

  /**
   * Poll resolved queue, returns promise for list of message objects
   * on the form:
   *
   * ```js
   * [
   *   {
   *     taskId:      '<taskId>',      // taskId that was resolved
   *     taskGroupId: '<taskGroupId>', // taskGroupId of task that was resolved
   *     resolution:  ...,             // resolution of the task
   *     remove:      function() {},   // Delete message call when handled
   *   },
   *   ... // up-to to 32 objects in one list
   * ]
   * ```
   *
   * Note, messages must be handled within 10 minutes.
   */
  async pollResolvedQueue(count = 32) {
    // if message is not processed on time, different handler will pick it up after timeout
    // if it is processed, it would be removed from the table
    const hideUntil = taskcluster.fromNow(MESSAGE_FREEZE_TIMEOUT);

    const rows = await this.db.fns.queue_resolved_task_get(hideUntil, count);
    return rows.map(({
      task_id: taskId,
      task_group_id: taskGroupId,
      scheduler_id: schedulerId,
      resolution,
      pop_receipt,
    }) => ({
      taskId,
      taskGroupId,
      schedulerId,
      resolution,
      remove: async () => this.db.fns.queue_resolved_task_delete(taskId, pop_receipt),
    }));
  }

  /** Enqueue message to become visible when deadline has expired */
  async putDeadlineMessage(taskId, taskGroupId, schedulerId, deadline) {
    assert(taskId, 'taskId must be given');
    assert(taskGroupId, 'taskGroupId must be given');
    assert(schedulerId, 'schedulerId must be given');
    assert(deadline instanceof Date, 'deadline must be a date');
    assert(isFinite(deadline), 'deadline must be a valid date');

    let delay = Math.floor(this.deadlineDelay / 1000);
    debug('Put deadline message to be visible in %s seconds',
      secondsTo(deadline) + delay);

    await this.db.fns.queue_task_deadline_put(
      taskGroupId,
      taskId,
      schedulerId,
      deadline.toJSON(), // this is to be checked against task record if it didn't change
      taskcluster.fromNow(`${secondsTo(deadline) + delay} seconds`), // this is slightly after deadline
    );
  }

  /**
   * Poll deadline resolution queue, returns promise for list of message objects
   * on the form:
   *
   * ```js
   * [
   *   {
   *     taskId:      '<taskId>',     // Task to check
   *     deadline:    [Date object],  // Deadline of task when submitted
   *     remove:      function() {},  // Delete message call when handled
   *   },
   * ]
   * ```
   *
   * Note, messages must be handled within 10 minutes.
   */
  async pollDeadlineQueue(count = 32) {
    // if message is not processed on time, different handler will pick it up after timeout
    // if it is processed, it would be removed from the table
    const hideUntil = taskcluster.fromNow(MESSAGE_FREEZE_TIMEOUT);

    const rows = await this.db.fns.queue_task_deadline_get(hideUntil, count);
    return rows.map(({
      task_id: taskId,
      task_group_id: taskGroupId,
      scheduler_id: schedulerId,
      deadline,
      pop_receipt,
    }) => ({
      taskId,
      taskGroupId,
      schedulerId,
      deadline: new Date(deadline),
      remove: async () => this.db.fns.queue_task_deadline_delete(taskId, pop_receipt),
    }));
  }

  /**
   * Remove expired tasks from the pending queue
   */
  async deleteExpired() {
    await this.db.fns.queue_pending_tasks_delete_expired();
  }

  /**
   * Enqueue message about a new pending task in appropriate queue
   *
   * The `task` argument is an object with the properties:
   *  - `taskId`
   *  - `provisionerId`
   *  - `workerType`, and
   *  - `deadline`
   *
   * Notice that a data.Task entity fits this description perfectly.
   */
  async putPendingMessage(task, runId) {
    assert(typeof task.taskId === 'string', 'Expected task.taskId');
    assert(typeof runId === 'number', 'Expected runId as number');
    assert(typeof task.taskQueueId === 'string', 'Expected task.taskQueueId');
    assert(task.deadline instanceof Date, 'Expected task.deadline');

    // // Find the time to deadline
    let timeToDeadline = secondsTo(task.deadline);
    // If deadline is reached, we don't care to publish a message about the task
    // being pending.
    if (timeToDeadline === 1) {
      // This should not happen, but if timing is right it is possible.
      console.log('runId: %s of taskId: %s became pending after deadline, ' +
                  'skipping pending task publication',
      runId, task.taskId);
      return;
    }

    await this.db.fns.queue_pending_tasks_put(
      task.taskQueueId,
      PRIORITY_TO_CONSTANT[task.priority] || 0,
      task.taskId,
      runId,
      slugid.v4(), // hintId
      taskcluster.fromNow(`${timeToDeadline} seconds`), // expires in
    );
  }

  /**
   * Return tasks for a given task queue id in order of priority.
   *
   * Fetched tasks would be assigned `pop_receipt` which will make it invisible to other queries
   * Once task is processed, record would be removed. If it wasn't processed,
   * `pop_receipt` would be cleared, so it would be come "visible" to the queue again.
   *
   * Returns messages in the form:
   * {
   *   taskId:  '...',        // taskId from the message
   *   runId:   0,            // runId from the message
   *   hintId:  '...',        // hintId from the message
   *   remove:  function() {} // Async function to delete the message
   *   release: function() {} // Async function that makes the message visible
   * }
   */
  pollPendingQueue(taskQueueId) {
    return async (count) => {
      const rows = await this.db.fns.queue_pending_tasks_get(
        taskQueueId,
        taskcluster.fromNow(MESSAGE_FREEZE_TIMEOUT), // hide until
        count,
      );
      return rows.map(({
        task_id: taskId,
        run_id: runId,
        hint_id: hintId,
        pop_receipt,
      }) => ({
        taskId,
        runId,
        hintId,
        remove: async () => this.db.fns.queue_pending_tasks_delete(taskId, pop_receipt),
        release: async () => this.db.fns.queue_pending_tasks_release(taskId, pop_receipt),
      }));
    };
  }

  /**
   * Count number of pending tasks for a given task queue
   *
   * @param {String} taskQueueId
   * @returns {Number} number of pending tasks
   */
  async countPendingTasks(taskQueueId) {
    const [{ queue_pending_tasks_count }] = await this.db.fns.queue_pending_tasks_count(taskQueueId);
    return queue_pending_tasks_count;
  }
}

module.exports = QueueService;
