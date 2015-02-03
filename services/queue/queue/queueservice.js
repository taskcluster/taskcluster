var azure       = require('azure-storage');
var _           = require('lodash');
var Promise     = require('promise');
var debug       = require('debug')('queue:queue');
var assert      = require('assert');
var base32      = require('thirty-two');
var querystring = require('querystring');
var crypto      = require('crypto');
var cryptiles   = require('cryptiles');
var data        = require('./data');

/** Decode Url-safe base64, our identifiers satisfies these requirements */
var decodeUrlSafeBase64 = function(data) {
  return new Buffer(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

/** Get seconds until `target` relative to now (by default) */
var secondsTo = function(target, relativeTo = new Date()) {
  return Math.floor((target.getTime() - relativeTo.getTime()) / 1000);
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
   *   signatureSecret:      // Secret for generating signatures
   *   pendingPollTimeout:   // Timeout embedded in signed poll URL (ms)
   *   credentials: {
   *     accountName:        // Azure storage account name
   *     accountKey:         // Azure storage account key
   *   },
   *   deadlineQueue:        // Queue name for the deadline queue
   *   deadlineDelay:        // Delay before deadline expiration (ms)
   *                         // Default 15 min, should be high to allow drift!
   * }
   */
  constructor(options) {
    assert(options, "options is required");
    assert(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(options.prefix), "Invalid prefix");
    assert(options.prefix.length <= 6, "Prefix is too long");
    assert(options.signatureSecret, "a signatureSecret must be given");
    assert(options.deadlineQueue, "A deadlineQueue name must be given");
    options = _.defaults({}, options, {
      deadlineDelay:        15 * 60 * 1000,
      pendingPollTimeout:   300 * 1000
    });

    this.prefix = options.prefix;
    this.signatureSecret = options.signatureSecret;
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

    // Store deadlineQueue name, and remember if we've created it
    this.deadlineQueue = options.deadlineQueue;
    this.deadlineDelay = options.deadlineDelay;
    this.deadlineQueueReady = null;
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

  /** Enqueue message to become visible when deadline has expired */
  async putDeadlineMessage(taskId, deadline) {
    assert(taskId, "taskId must be given");
    assert(deadline instanceof Date, "deadline must be a date");
    assert(isFinite(deadline), "deadline must be a valid date");

    await this.ensureDeadlineQueue();

    var msToDeadline = (deadline.getTime() - new Date().getTime());
    var timeout      = Math.floor((msToDeadline + this.deadlineDelay) / 1000);
    return new Promise((accept, reject) => {
      this.service.createMessage(this.deadlineQueue, JSON.stringify({
        taskId:             taskId
      }), {
        ttl:                7 * 24 * 60 * 60,
        visibilityTimeout:  timeout
      }, function(err) { err ? reject(err) : accept() });
    });
  }

  /**
   * Poll deadline resolution queue, returns promise for list of message objects
   * on the form:
   *
   * ```js
   * [
   *   {
   *     taskId:    '<taskId>',     // Task to check
   *     remove:    function() {},  // Function to call when message is handled
   *   },
   *   ... // up-to to 32 objects in one list
   * ]
   * ```
   *
   * Note, messages must be handled within 10 minutes. Also note that a
   * message with a `taskId` doesn't necessarily mean that the task exists, or
   * that this task is to be resolved by deadline expiration. It just means
   * that we must load the task (if it exists) and check if it needs to be
   * resolved by deadline.
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
   * Generate signature for a pending task message.
   *
   * Do **NOT** use this for validation of signatures, please use the
   * `validateSignature` method to avoid timing attacks.
   */
  generateSignature(task, runId) {
    assert(task instanceof data.Task, "Expect a Task entity");
    assert(typeof(runId) === 'number', "Expected runId as number");
    return crypto.createHmac('sha256', this.signatureSecret).update([
      task.deadline.getTime(),
      task.provisionerId,
      task.workerType,
      task.taskId,
      runId
    ].join('\n')).digest('base64');
  }

  /** Validate signature from pending task message */
  validateSignature(task, runId, signature) {
    assert(typeof(signature) === 'string', "signature must be a string");
    return cryptiles.fixedTimeComparison(signature,
      this.generateSignature(task, runId)
    );
  }

  /** Enqueue message about a new pending task in appropriate queue */
  async putPendingMessage(task, runId) {
    assert(task instanceof data.Task, "Expect a Task entity");
    assert(typeof(runId) === 'number', "Expected runId as number");

    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(
      task.provisionerId,
      task.workerType
    );

    // Generate signature
    var sig = this.generateSignature(task, runId);

    // Put message queue
    return new Promise((accept, reject) => {
      this.service.createMessage(queueName, JSON.stringify({
        taskId:     task.taskId,
        runId:      runId,
        signature:  sig
      }), {
        messagettl:         secondsTo(task.deadline),
        visibilityTimeout:  0
      }, (err) => { err ? reject(err) : accept() });
    });
  }

  /**
   * Update message to given task and runId, using messageId and receipt
   *
   * The updated message will become visible in `delay` ms. This method returns
   * a promise for an object containing the new receipt:
   * ```js
   * {
   *   messageId:     // Message id (should be same as input)
   *   receipt:       // Receipt on the claim for the message
   *   takenUntil:    // Date object for when message is visible again
   * }
   * ```
   */
  async updatePendingTaskMessage(task, runId, delay, messageId, receipt) {
    assert(task instanceof data.Task, "Expect a Task entity");
    assert(typeof(runId) === 'number', "Expected runId as number");
    assert(typeof(delay) === 'number', "Expected delay as number");

    delay = Math.floor(delay / 1000);

    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(
      task.provisionerId,
      task.workerType
    );

    // Construct message text
    var text = JSON.stringify({
      taskId:         task.taskId,
      runId:          runId,
      signature:      this.generateSignature(task, runId)
    });

    // Update message
    var message = await new Promise((accept, reject) => {
      this.service.updateMessage(queueName, messageId, receipt, delay, {
        // See: https://github.com/Azure/azure-storage-node/issues/43
        messagetext:  text,
        messageText:  text
      }, (err, message) => { err ? reject(err) : accept(message) });
    });

    return {
      messageId:    message.messageid,
      receipt:      message.popreceipt,
      takenUntil:   new Date(message.timenextvisible)
    };
  }

  /** Delete pending task message from azure queue */
  async deletePendingTaskMessage(task, messageId, receipt) {
    assert(task instanceof data.Task, "Expect a Task entity");

    // Find name of azure queue
    var queueName = await this.ensurePendingQueue(
      task.provisionerId,
      task.workerType
    );

    return new Promise((accept, reject) => {
      this.service.deleteMessage(queueName, messageId, receipt, (err) => {
        err ? reject(err) : accept()
      });
    });
  }

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
      expiry:         expiry,
      signedPollUrl:  `https://${this.accountName}.` +
                      `queue.core.windows.net/${queueName}` +
                      `/messages?visibilitytimeout=${pendingPollTimeout}` +
                      `&${sas}`
    };
  }

};

// Export QueueService
module.exports = QueueService;
