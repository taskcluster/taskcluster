let _ = require('lodash');
let debug = require('debug')('app:queue');
let assert = require('assert');
// let base32 = require('thirty-two');
// let crypto = require('crypto');
let slugid = require('slugid');
// let AZQueue = require('taskcluster-lib-azqueue');
// let { splitTaskQueueId } = require('./utils');

/** Get seconds until `target` relative to now (by default).  This rounds up
 * and always waits at least one second, to avoid races in tests where
 * everything happens in a matter of milliseconds. */
let secondsTo = (target, relativeTo = new Date()) => {
  let delta = Math.ceil((target.getTime() - relativeTo.getTime()) / 1000);
  return Math.max(delta, 1);
};

/** Validate task description object */
let validateTask = task => {
  assert(typeof task.taskId === 'string', 'Expected task.taskId');
  assert(typeof task.taskQueueId === 'string',
    'Expected task.taskQueueId');
  assert(task.deadline instanceof Date, 'Expected task.deadline');
};

/** Priority to constant for use in queue name (should be a string) */
const PRIORITY_TO_CONSTANT = {
  highest: '7',
  'very-high': '6',
  high: '5',
  medium: '4',
  low: '3',
  'very-low': '2',
  lowest: '1',
};
_.forIn(PRIORITY_TO_CONSTANT, v => assert(typeof v === 'string'));

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

/**
 * Wrapper for azure queue storage, to ease our use cases.
 * Specifically, this supports managing the deadline message queue, and the
 * pending-task queues stored in azure, both creation and operations on these
 * queues.
 */
class QueueService {
  /**
   * Create convenient azure queue storage wrapper, for managing how we
   * interface azure queue.
   *
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

    // this.client = new AZQueue({ db: options.db });
    // just a proxy for now
    this.client = new Proxy({}, {
      get: (target, prop) => {
        return (...args) => {
          console.log('AZQueue.%s(%j)', prop, args);
        };
      },
      apply: (target, thisArg, args) => {
        console.log('AZQueue(%j)', args);
      },
    });

    this.deadlineDelay = options.deadlineDelay;
  }

  terminate() {
    // ?
  }

  async _getMessages(queue, { visibility, count }) {
    let messages = await this.monitor.timer('getMessages', this.client.getMessages(queue, {
      visibilityTimeout: visibility,
      numberOfMessages: count,
    }));
    return messages.map(msg => {
      return {
        payload: JSON.parse(Buffer.from(msg.messageText, 'base64')),
        remove: this.client.deleteMessage.bind(
          this.client,
          queue,
          msg.messageId,
          msg.popReceipt,
        ),
        release: this.client.updateMessage.bind(
          this.client,
          queue,
          msg.messageText,
          msg.messageId,
          msg.popReceipt, {
            visibilityTimeout: 0,
          },
        ),
      };
    });
  }

  /** Enqueue message to become visible when claim has expired */
  async putClaimMessage(taskId, runId, takenUntil) {
    assert(taskId, 'taskId must be given');
    assert(typeof runId === 'number', 'runId must be a number');
    assert(takenUntil instanceof Date, 'takenUntil must be a date');
    assert(isFinite(takenUntil), 'takenUntil must be a valid date');

    // TODO
    // this.db.fns.put_claim_message() ...

    // return this._putMessage(this.claimQueue, {
    //   taskId: taskId,
    //   runId: runId,
    //   takenUntil: takenUntil.toJSON(),
    // }, {
    //   ttl: 7 * 24 * 60 * 60,
    //   visibility: secondsTo(takenUntil),
    // });
    // _putMessage(queue, message, { visibility, ttl, taskQueueId, priority }) {
    //   let text = Buffer.from(JSON.stringify(message)).toString('base64');
    //   return this.monitor.timer('putMessage', this.client.putMessage(queue, text, {
    //     visibilityTimeout: visibility,
    //     messageTTL: ttl,
    //     taskQueueId,
    //     priority,
    //   }));
    // }
  }

  /** Enqueue message ensure the dependency resolver handles the resolution */
  async putResolvedMessage(taskId, taskGroupId, schedulerId, resolution) {
    assert(taskId, 'taskId must be given');
    assert(taskGroupId, 'taskGroupId must be given');
    assert(schedulerId, 'schedulerId must be given');
    assert(resolution === 'completed' || resolution === 'failed' ||
           resolution === 'exception',
    'resolution must be completed, failed or exception');

    // TODO
    // this.db.fns.put_resolved_message() ...

    // return this._putMessage(this.resolvedQueue, {
    //   taskId, taskGroupId, schedulerId, resolution,
    // }, {
    //   ttl: 7 * 24 * 60 * 60,
    //   visibility: 0,
    // });
    // _putMessage(queue, message, { visibility, ttl, taskQueueId, priority }) {
    //   let text = Buffer.from(JSON.stringify(message)).toString('base64');
    //   return this.monitor.timer('putMessage', this.client.putMessage(queue, text, {
    //     visibilityTimeout: visibility,
    //     messageTTL: ttl,
    //     taskQueueId,
    //     priority,
    //   }));
    // }
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

    // TODO
    // this.db.fns.put_deadline_message() ...

    // return this._putMessage(this.deadlineQueue, {
    //   taskId,
    //   taskGroupId,
    //   schedulerId,
    //   deadline: deadline.toJSON(),
    // }, {
    //   ttl: 7 * 24 * 60 * 60,
    //   visibility: secondsTo(deadline) + delay,
    // });
    // _putMessage(queue, message, { visibility, ttl, taskQueueId, priority }) {
    //   let text = Buffer.from(JSON.stringify(message)).toString('base64');
    //   return this.monitor.timer('putMessage', this.client.putMessage(queue, text, {
    //     visibilityTimeout: visibility,
    //     messageTTL: ttl,
    //     taskQueueId,
    //     priority,
    //   }));
    // }
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
  async pollClaimQueue() {
    // TODO
    // return this.db.fns.get_claim_queue() ... map()

    // Get messages
    // let messages = await this._getMessages(this.claimQueue, {
    //   visibility: 10 * 60,
    //   count: 32,
    // });

    // // Convert to neatly consumable format
    // return messages.map(m => {
    //   return {
    //     taskId: m.payload.taskId,
    //     runId: m.payload.runId,
    //     takenUntil: new Date(m.payload.takenUntil),
    //     remove: m.remove,
    //   };
    // });
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
  async pollResolvedQueue() {
    // TODO:

    // return this.db.fns.get_resolved_queue() ... map()

    // Get messages
    // let messages = await this._getMessages(this.resolvedQueue, {
    //   visibility: 10 * 60,
    //   count: 32,
    // });

    // // Convert to neatly consumable format
    // return messages.map(m => {
    //   return {
    //     taskId: m.payload.taskId,
    //     taskGroupId: m.payload.taskGroupId,
    //     schedulerId: m.payload.schedulerId,
    //     resolution: m.payload.resolution,
    //     remove: m.remove,
    //   };
    // });
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
   *   ... // up-to to 32 objects in one list
   * ]
   * ```
   *
   * Note, messages must be handled within 10 minutes.
   */
  async pollDeadlineQueue() {
    // TODO
    // return this.db.fns.get_deadline_queue() ... map()

    // Get messages
    // let messages = await this._getMessages(this.deadlineQueue, {
    //   visibility: 10 * 60,
    //   count: 32,
    // });

    // // Convert to neatly consumable format
    // return messages.map(m => {
    //   return {
    //     taskId: m.payload.taskId,
    //     taskGroupId: m.payload.taskGroupId,
    //     schedulerId: m.payload.schedulerId,
    //     deadline: new Date(m.payload.deadline),
    //     remove: m.remove,
    //   };
    // });
  }

  /**
   * Remove expired messages
   */
  async deleteExpiredMessages() {
    // TODO: remove for all 4 new tables
    await this.client.deleteExpiredMessages();
  }

  /**
   * Enqueue message about a new pending task in appropriate queue
   *
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
    validateTask(task);
    assert(typeof runId === 'number', 'Expected runId as number');

    // Find the time to deadline
    let timeToDeadline = secondsTo(task.deadline);
    // If deadline is reached, we don't care to publish a message about the task
    // being pending.
    if (timeToDeadline === 0) {
      // This should not happen, but if timing is right it is possible.
      console.log('runId: %s of taskId: %s became pending after deadline, ' +
                  'skipping pending message publication to azure queue',
      runId, task.taskId);
      return;
    }

    // Put message queue
    // TODO - call db directly to insert into right table

    // this.db.fns.put_pending_message() ...

    // return this._putMessage(task.taskQueueId, task.priority, {
    //   taskId: task.taskId,
    //   runId: runId,
    //   hintId: slugid.v4(),
    // }, {
    //   ttl: timeToDeadline,
    //   visibility: 0,
    //   taskQueueId: task.taskQueueId,
    //   priority: parseInt(PRIORITY_TO_CONSTANT[task.priority] || '0', 10),
    // });
    // _putMessage(queue, message, { visibility, ttl, taskQueueId, priority }) {
    //   let text = Buffer.from(JSON.stringify(message)).toString('base64');
    //   return this.monitor.timer('putMessage', this.client.putMessage(queue, text, {
    //     visibilityTimeout: visibility,
    //     messageTTL: ttl,
    //     taskQueueId,
    //     priority,
    //   }));
    // }
  }

  /**
   * Return tasks for a given task queue id in order of priority.
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
  async getTaskQueuePendingTasks(taskQueueId, count) {
    const rows = await this.db.fns.queue_pending_tasks_get(taskQueueId, count);
    return rows.map(({ task_id, run_id, hint_id, pop_receipt }) => {
      return {
        taskId: task_id,
        runId: run_id,
        hintId: hint_id,
        remove: async () => this.db.fns.queue_pending_tasks_delete(task_id, pop_receipt),
        release: async () => this.db.fns.queue_pending_tasks_release(task_id, pop_receipt),
      };
    });
  }

    // let queueNames = await this.ensurePendingQueue(taskQueueId);
    // // Order by priority (and convert to array)
    // let queues = PRIORITIES.map(priority => queueNames[priority]);

    // // For each queue, return poll(count) function
    // return queues.map(queue => {
    //   return async (count) => {
    //     // Get messages
    //     let messages = await this._getMessages(queue, {
    //       visibility: 5 * 60,
    //       count: Math.min(count, 32),
    //     });
    //     return messages.map(m => {
    //       return {
    //         taskId: m.payload.taskId,
    //         runId: m.payload.runId,
    //         hintId: m.payload.hintId,
    //         remove: m.remove,
    //         release: m.release,
    //       };
    //     });
    //   };
    // });
  }

  /**
   * Count number of pending tasks for a given task queue
   *
   * @param {String} taskQueueId
   * @returns {Number} number of pending tasks
   */
  async countPendingMessages(taskQueueId) {
    const [{ queue_pending_task_count }] = await this.db.fns.queue_pending_task_count(taskQueueId);
    return queue_pending_task_count;
  }
}

module.exports = QueueService;
