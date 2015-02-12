var azure       = require('azure-storage');
var _           = require('lodash');
var Promise     = require('promise');
var debug       = require('debug')('queue:queue');
var assert      = require('assert');
var base32      = require('thirty-two');
var querystring = require('querystring');
var url         = require('url');

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
    this.signatureSecret    = options.signatureSecret;
    this.pendingPollTimeout = options.pendingPollTimeout;

    // Documentation for the QueueService object can be found here:
    // http://dl.windowsazure.com/nodestoragedocs/index.html
    this.service = azure.createQueueService(
      options.credentials.accountName,
      options.credentials.accountKey
    ).withFilter(new azure.ExponentialRetryPolicyFilter());

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

  /** Ensure existence of the claim queue */
  ensureClaimQueue() {
    if (this.claimQueueReady) {
      return this.claimQueueReady;
    }
    return this.claimQueueReady = new Promise((accept, reject) => {
      this.service.createQueueIfNotExists(this.claimQueue, {}, (err) => {
        if (err) {
          // Don't cache negative results
          this.claimQueueReady = null;
          return reject(err);
        }
        accept();
      });
    });
  }

  /** Ensure existence of the deadline queue */
  ensureDeadlineQueue() {
    if (this.deadlineQueueReady) {
      return this.deadlineQueueReady;
    }
    return this.deadlineQueueReady = new Promise((accept, reject) => {
      this.service.createQueueIfNotExists(this.deadlineQueue, {}, (err) => {
        if (err) {
          // Don't cache negative results
          this.deadlineQueueReady = null;
          return reject(err);
        }
        accept();
      });
    });
  }

  /** Enqueue message to become visible when claim has expired */
  async putClaimMessage(taskId, runId, takenUntil) {
    assert(taskId,                      "taskId must be given");
    assert(typeof(runId) === 'number',  "runId must be a number");
    assert(takenUntil instanceof Date,  "takenUntil must be a date");
    assert(isFinite(takenUntil),        "takenUntil must be a valid date");

    await this.ensureClaimQueue();
    return new Promise((accept, reject) => {
      this.service.createMessage(this.claimQueue, JSON.stringify({
        taskId:             taskId,
        runId:              runId,
        takenUntil:         takenUntil.toJSON()
      }), {
        ttl:                7 * 24 * 60 * 60,
        visibilityTimeout:  secondsTo(takenUntil)
      }, function(err) { err ? reject(err) : accept() });
    });
  }

  /** Enqueue message to become visible when deadline has expired */
  async putDeadlineMessage(taskId, deadline) {
    assert(taskId,                      "taskId must be given");
    assert(deadline instanceof Date,    "deadline must be a date");
    assert(isFinite(deadline),          "deadline must be a valid date");

    await this.ensureDeadlineQueue();
    var delay = Math.floor(this.deadlineDelay / 1000);
    return new Promise((accept, reject) => {
      this.service.createMessage(this.deadlineQueue, JSON.stringify({
        taskId:             taskId,
        deadline:           deadline.toJSON()
      }), {
        ttl:                7 * 24 * 60 * 60,
        visibilityTimeout:  secondsTo(deadline) + delay
      }, function(err) { err ? reject(err) : accept() });
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
    var messages = await new Promise((accept, reject) => {
      this.service.getMessages(this.claimQueue, {
        numOfMessages:        32,
        peekOnly:             false,
        visibilityTimeout:    10 * 60,
      }, (err, messages) => { err ? reject(err) : accept(messages) });
    });

    // Convert to neatly consumable format
    return messages.map((message) => {
      var payload = JSON.parse(message.messagetext);
      return {
        taskId:     payload.taskId,
        runId:      payload.runId,
        takenUntil: new Date(payload.takenUntil),
        remove:     () => {
          return new Promise((accept, reject) => {
            this.service.deleteMessage(
              this.claimQueue,
              message.messageid, message.popreceipt,
              (err) => { err ? reject(err) : accept() }
            );
          });
        }
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
    var messages = await new Promise((accept, reject) => {
      this.service.getMessages(this.deadlineQueue, {
        numOfMessages:        32,
        peekOnly:             false,
        visibilityTimeout:    10 * 60,
      }, (err, messages) => { err ? reject(err) : accept(messages) });
    });

    // Convert to neatly consumable format
    return messages.map((message) => {
      var payload = JSON.parse(message.messagetext);
      return {
        taskId:     payload.taskId,
        deadline:   new Date(payload.deadline),
        remove:     () => {
          return new Promise((accept, reject) => {
            this.service.deleteMessage(
              this.deadlineQueue,
              message.messageid, message.popreceipt,
              (err) => { err ? reject(err) : accept() }
            );
          });
        }
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

    return this.queues[id] = new Promise((accept, reject) => {
      this.service.createQueueIfNotExists(name, {}, (err) => {
        if (err) {
          // Don't cache negative results
          this.queues[id] = undefined;
          return reject(err);
        }
        accept(name);
      });
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

    // Put message queue
    return new Promise((accept, reject) => {
      this.service.createMessage(queueName, JSON.stringify({
        taskId:     task.taskId,
        runId:      runId
      }), {
        messagettl:         secondsTo(task.deadline),
        visibilityTimeout:  0
      }, (err) => { err ? reject(err) : accept() });
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
    var sas = this.service.generateSharedAccessSignature(queueName, {
      AccessPolicy: {
        Permissions:  azure.QueueUtilities.SharedAccessPermissions.PROCESS,
        Start:        start,
        Expiry:       expiry
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
    var data = await new Promise((accept, reject) => {
      this.service.getQueueMetadata(queueName, (err, data) => {
        err ? reject(err) : accept(data)
      });
    });

    return parseInt(data.approximatemessagecount);
  }
};

// Export QueueService
module.exports = QueueService;
