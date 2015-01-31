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
   *   credentials: {
   *     accountName:        // Azure storage account name
   *     accountKey:         // Azure storage account key
   *   },
   *   deadlineQueue:        // Queue name for the deadline queue
   *   deadlineDelay:        // Number of ms to delay deadline expiration
   *                         // Default 15 min, should be high to allow drift!
   * }
   */
  constructor(options) {
    assert(options, "options is required");
    assert(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(options.prefix), "Invalid prefix");
    assert(options.prefix.length <= 6, "Prefix is too long");
    assert(options.signatureSecret, "a signatureSecret must be given");
    assert(options.deadlineQueue, "A deadlineQueue name must be given");
    this.prefix = options.prefix;
    this.signatureSecret = options.signatureSecret;

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
    this.deadlineDelay = options.deadlineDelay || (15 * 60 * 1000);
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
      }, function(err) {
        if(err) {
          return reject(err);
        }
        accept();
      });
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
    var sig = crypto.createHmac('sha256', this.signatureSecret).update([
      task.deadline.getTime(),
      task.provisionerId,
      task.workerType,
      task.taskId,
      runId
    ].join('\n')).digest('base64');

    // Put message queue
    return new Promise((accept, reject) => {
      this.service.createMessage(queueName, JSON.stringify({
        taskId:     task.taskId,
        runId:      runId,
        signature:  sig
      }), {
        messagettl:         secondsTo(task.deadline),
        visibilityTimeout:  0
      }, (err) => {
        if(err) {
          return reject(err);
        }
        accept();
      });
    });
  }

  /** Validate signature from pending task message */
  validateSignature(task, runId, signature) {
    assert(task instanceof data.Task, "Expect a Task entity");
    assert(typeof(runId) === 'number', "Expected runId as number");
    assert(typeof(signature) === 'string', "signature must be a string");
    return cryptiles.fixedTimeComparison(signature,
      crypto.createHmac('sha256', this.signatureSecret).update([
        task.deadline.getTime(),
        task.provisionerId,
        task.workerType,
        task.taskId,
        runId
      ].join('\n')).digest('base64')
    );
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
      this.service.deleteMessage(name, msgId, receipt, (err) => {
        if (err) {
          return reject(err);
        }
        accept();
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
    var sas = this.service.generateSharedAccessSignature(name, {
      AccessPolicy: {
        Permissions:  azure.QueueUtilities.SharedAccessPermissions.PROCESS,
        Start:        start,
        Expiry:       expiry
      }
    });

    return {
      expiry:         expiry,
      signedPollUrl:  `https://${this.accountName}.` +
                      `queue.core.windows.net/${queueName}` +
                      `/messages?visibilitytimeout=300&${sas}`
    };
  }

};

// Export QueueService
module.exports = QueueService;
