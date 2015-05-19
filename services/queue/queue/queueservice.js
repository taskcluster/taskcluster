var _           = require('lodash');
var Promise     = require('promise');
var debug       = require('debug')('queue:queue');
var assert      = require('assert');
var base32      = require('thirty-two');
var querystring = require('querystring');
var url         = require('url');
var base        = require('taskcluster-base');
var azure       = require('fast-azure-storage');

/** Timeout for azure queue requests */
var AZURE_QUEUE_TIMEOUT     = 7 * 1000;

/** Azure queue agent used for all instances of the queue client */
var globalAzureQueueAgent = new azure.Agent({
  keepAlive:        true,
  maxSockets:       100,
  maxFreeSockets:   100
});

/** Decode Url-safe base64, our identifiers satisfies these requirements */
var decodeUrlSafeBase64 = function(data) {
  return new Buffer(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

/** Get seconds until `target` relative to now (by default) */
var secondsTo = function(target, relativeTo = new Date()) {
  var delta = Math.floor((target.getTime() - relativeTo.getTime()) / 1000);
  return Math.max(delta, 0); // never return negative time
};

/** Validate task description object */
var validateTask = function(task) {
  assert(typeof(task.taskId) === 'string', "Expected task.taskId");
  assert(typeof(task.provisionerId) === 'string',
         "Expected task.provisionerId");
  assert(typeof(task.workerType) === 'string', "Expected task.workerType");
  assert(task.deadline instanceof Date, "Expected task.deadline");
};

/**
 * Wrapper for azure queue storage, to ease our use cases.
 * Specifically, this supports managing the deadline message queue, and the
 * pending-task queues stored in azure, both creation and operations on these
 * queues.
 */
class QueueService {
  /**
   * Create convenient azure queue storage wrapper, for managing how we interface
   * azure queue.
   *
   * options:
   * {
   *   prefix:               // Prefix for all pending-task queues, max 6 chars
   *   pendingPollTimeout:   // Timeout embedded in signed poll URL (ms)
   *   credentials: {
   *     accountName:        // Azure storage account name
   *     accountKey:         // Azure storage account key
   *   },
   *   claimQueue:           // Queue name for the claim expiration queue
   *   deadlineQueue:        // Queue name for the deadline queue
   *   deadlineDelay:        // ms before deadline expired messages arrive
   * }
   */
  constructor(options) {
    assert(options, "options is required");
    assert(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(options.prefix), "Invalid prefix");
    assert(options.prefix.length <= 6,  "Prefix is too long");
    assert(options.claimQueue,          "A claimQueue name must be given");
    assert(options.deadlineQueue,       "A deadlineQueue name must be given");
    options = _.defaults({}, options, {
      pendingPollTimeout:    5 * 60 * 1000,
      deadlineDelay:        10 * 60 * 1000
    });

    this.prefix             = options.prefix;
    this.pendingPollTimeout = options.pendingPollTimeout;

    this.client = new azure.Queue({
      accountId:    options.credentials.accountName,
      accessKey:    options.credentials.accountKey,
      timeout:      AZURE_QUEUE_TIMEOUT
    });

    // Store account name of use in SAS signed Urls
    this.accountName = options.credentials.accountName;

    // Promises that queues are created, return the queue name
    this.queues = {};

    // Store claimQueue  name, and remember if we've created it
    this.claimQueue         = options.claimQueue;
    this.claimQueueReady    = null;

    // Store deadlineQueue name, and remember if we've created it
    this.deadlineQueue      = options.deadlineQueue;
    this.deadlineDelay      = options.deadlineDelay;
    this.deadlineQueueReady = null;
  }

  _createQueue(queue) {
    return this.client.createQueue(queue);
  }

  _countMessages(queue) {
    return this.client.getMetadata(queue).then(_.property('messageCount'));
  }

  _putMessage(queue, message, {visibility, ttl}) {
    var text = new Buffer(JSON.stringify(message)).toString('base64');
    return this.client.putMessage(queue, text, {
      visibilityTimeout:    visibility,
      messageTTL:           ttl
    });
  }

  async _getMessages(queue, {visibility, count}) {
    var messages = await this.client.getMessages(queue, {
      visibilityTimeout:    visibility,
      numberOfMessages:     count
    });
    return messages.map(msg => {
      return {
        payload:  JSON.parse(new Buffer(msg.messageText, 'base64')),
        remove:   this.client.deleteMessage.bind(
          this.client,
          queue,
          msg.messageId,
          msg.popReceipt
        )
      };
    });
  }

  /** Ensure existence of the claim queue */
  ensureClaimQueue() {
    if (this.claimQueueReady) {
      return this.claimQueueReady;
    }
    return this.claimQueueReady = this._createQueue(
      this.claimQueue
    ).catch(err => {
      // Don't cache negative results
      this.claimQueueReady = null;
      throw err;
    });
  }

  /** Ensure existence of the deadline queue */
  ensureDeadlineQueue() {
    if (this.deadlineQueueReady) {
      return this.deadlineQueueReady;
    }
    return this.deadlineQueueReady = this._createQueue(
      this.deadlineQueue
    ).catch(err => {
      // Don't cache negative results
      this.deadlineQueueReady = null;
      throw err;
    });
  }

  /** Enqueue message to become visible when claim has expired */
  async putClaimMessage(taskId, runId, takenUntil) {
    assert(taskId,                      "taskId must be given");
    assert(typeof(runId) === 'number',  "runId must be a number");
    assert(takenUntil instanceof Date,  "takenUntil must be a date");
    assert(isFinite(takenUntil),        "takenUntil must be a valid date");

    await this.ensureClaimQueue();
    return this._putMessage(this.claimQueue, {
      taskId:             taskId,
      runId:              runId,
      takenUntil:         takenUntil.toJSON()
    }, {
      ttl:                7 * 24 * 60 * 60,
      visibility:         secondsTo(takenUntil)
    });
  }

  /** Enqueue message to become visible when deadline has expired */
  async putDeadlineMessage(taskId, deadline) {
    assert(taskId,                      "taskId must be given");
    assert(deadline instanceof Date,    "deadline must be a date");
    assert(isFinite(deadline),          "deadline must be a valid date");

    await this.ensureDeadlineQueue();
    var delay = Math.floor(this.deadlineDelay / 1000);
    debug("Put deadline message to be visible in %s seconds",
           secondsTo(deadline) + delay);
    return this._putMessage(this.deadlineQueue, {
      taskId:             taskId,
      deadline:           deadline.toJSON()
    }, {
      ttl:                7 * 24 * 60 * 60,
      visibility:         secondsTo(deadline) + delay
    });
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
    // Ensure the claim queue exists
    await this.ensureClaimQueue();

    // Get messages
    var messages = await this._getMessages(this.claimQueue, {
      visibility:             10 * 60,
      count:                  32
    });

    // Convert to neatly consumable format
    return messages.map(m => {
      return {
        taskId:       m.payload.taskId,
        runId:        m.payload.runId,
        takenUntil:   new Date(m.payload.takenUntil),
        remove:       m.remove
      };
    });
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
    // Ensure the deadline queue exists
    await this.ensureDeadlineQueue();

    // Get messages
    var messages = await this._getMessages(this.deadlineQueue, {
      visibility:             10 * 60,
      count:                  32
    });

    // Convert to neatly consumable format
    return messages.map(m => {
      return {
        taskId:       m.payload.taskId,
        deadline:     new Date(m.payload.deadline),
        remove:       m.remove
      };
    });
  }

  /** Ensure existence of a queue */
  ensurePendingQueue(provisionerId, workerType) {
    // Construct id, note that slash cannot be used in provisionerId, workerType
    var id = provisionerId + '/' + workerType;

    // Find promise
    if (this.queues[id]) {
      return this.queues[id];
    }

    // Create promise, if it doesn't exist
    assert(/^[A-Za-z0-9_-]{1,22}$/.test(provisionerId),
           "Expected provisionerId to be an identifier");
    assert(/^[A-Za-z0-9_-]{1,22}$/.test(workerType),
           "Expected workerType to be an identifier");
    // Construct queue name
    var name = [
      this.prefix,    // prefix all queues
      base32.encode(decodeUrlSafeBase64(provisionerId))
        .toString('utf8')
        .toLowerCase()
        .replace(/=*$/, ''),
      base32.encode(decodeUrlSafeBase64(workerType))
        .toString('utf8')
        .toLowerCase()
        .replace(/=*$/, ''),
      '1'             // priority, currently just hardcoded to 1
    ].join('-');

    // Return and cache promise that we created this queue
    return this.queues[id] = this._createQueue(name).catch(err => {
      // Don't cache negative results
      this.queues[id] = undefined;
      throw err;
    }).then(() => {
      return name;
    });
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
    assert(typeof(runId) === 'number', "Expected runId as number");

    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(
      task.provisionerId,
      task.workerType
    );

    // Find the time to deadline
    var timeToDeadline = secondsTo(task.deadline);
    // If deadline is reached, we don't care to publish a message about the task
    // being pending.
    if (timeToDeadline === 0) {
      // This should not happen, but if timing is right it is possible.
      debug("[not-a-bug] runId: %s of taskId: %s became pending after " +
            "deadline, skipping pending message publication to azure queue",
            runId, task.taskId);
      return;
    }

    // Put message queue
    return this._putMessage(queueName, {
      taskId:     task.taskId,
      runId:      runId
    }, {
      ttl:          timeToDeadline,
      visibility:   0
    });
  }

  /** Get signed URLs for polling and deleting from the azure queue */
  async signedPendingPollUrl(provisionerId, workerType) {
    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(provisionerId, workerType);

    // Set start of the signature to 15 min in the past
    var start = new Date();
    start.setMinutes(start.getMinutes() - 15);

    // Set the expiry of the signature to 30 min in the future
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 30);

    // Create shared access signature
    var sas = this.client.sas(queueName, {
      start, expiry,
      permissions: {
        process:    true
      }
    });

    var pendingPollTimeout = Math.floor(this.pendingPollTimeout / 1000);
    return {
      expiry:           expiry,
      signedPollUrl: url.format({
        protocol:       'https',
        host:           `${this.accountName}.queue.core.windows.net`,
        pathname:       `/${queueName}/messages`,
        search:         `?visibilitytimeout=${pendingPollTimeout}&${sas}`
      }),
      signedDeleteUrl: url.format({
        protocol:       'https',
        host:           `${this.accountName}.queue.core.windows.net`,
        pathname:       `/${queueName}/messages/{{messageId}}`,
        search:         `?popreceipt={{popReceipt}}&${sas}`
      })
    };
  }

  /** Returns promise for number of messages pending in pending task queue */
  async countPendingMessages(provisionerId, workerType) {
    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(provisionerId, workerType);

    // Get queue meta-data
    return this._countMessages(queueName);
  }
};

// Export QueueService
module.exports = QueueService;
