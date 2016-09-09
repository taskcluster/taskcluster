var _           = require('lodash');
var Promise     = require('promise');
var debug       = require('debug')('app:queue');
var assert      = require('assert');
var base32      = require('thirty-two');
var querystring = require('querystring');
var url         = require('url');
var base        = require('taskcluster-base');
var azure       = require('fast-azure-storage');
var crypto      = require('crypto');
var taskcluster = require('taskcluster-client');

/** Timeout for azure queue requests */
var AZURE_QUEUE_TIMEOUT     = 7 * 1000;

/** Azure queue agent used for all instances of the queue client */
var globalAzureQueueAgent = new azure.Agent({
  keepAlive:        true,
  maxSockets:       100,
  maxFreeSockets:   100,
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
  assert(typeof task.taskId === 'string', 'Expected task.taskId');
  assert(typeof task.provisionerId === 'string',
         'Expected task.provisionerId');
  assert(typeof task.workerType === 'string', 'Expected task.workerType');
  assert(task.deadline instanceof Date, 'Expected task.deadline');
};

/** Priority to constant for use in queue name (should be a string) */
const PRIORITY_TO_CONSTANT = {
  high:   '5',
  normal: '1',
};
_.forIn(PRIORITY_TO_CONSTANT, v => assert(typeof v === 'string'));

/** Priority in order of priority from high to low */
const PRIORITIES = [
  'high',
  'normal',
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
   *   prefix:               // Prefix for all pending-task queues, max 6 chars
   *   pendingPollTimeout:   // Timeout embedded in signed poll URL (ms)
   *   credentials: {
   *     accountName:        // Azure storage account name
   *     accountKey:         // Azure storage account key
   *   },
   *   claimQueue:           // Queue name for the claim expiration queue
   *   resolvedQueue:        // Queue name for the resolved task queue
   *   deadlineQueue:        // Queue name for the deadline queue
   *   deadlineDelay:        // ms before deadline expired messages arrive
   *   monitor:              // base.monitor instance
   * }
   */
  constructor(options) {
    assert(options, 'options is required');
    assert(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(options.prefix), 'Invalid prefix');
    assert(options.prefix.length <= 6,  'Prefix is too long');
    assert(options.resolvedQueue,       'A resolvedQueue name must be given');
    assert(options.claimQueue,          'A claimQueue name must be given');
    assert(options.deadlineQueue,       'A deadlineQueue name must be given');
    assert(options.monitor,             'A monitor instance must be given');
    options = _.defaults({}, options, {
      pendingPollTimeout:    5 * 60 * 1000,
      deadlineDelay:        10 * 60 * 1000,
    });

    this.prefix             = options.prefix;
    this.pendingPollTimeout = options.pendingPollTimeout;
    this.monitor            = options.monitor;

    this.client = new azure.Queue({
      accountId:    options.credentials.accountName,
      accessKey:    options.credentials.accountKey,
      timeout:      AZURE_QUEUE_TIMEOUT,
    });

    // Store account name of use in SAS signed Urls
    this.accountName = options.credentials.accountName;

    // Promises that queues are created, return mapping from priority to
    // azure queue names.
    this.queues = {};

    // Resets queues cache every 25 hours, this ensures that meta-data is kept
    // up-to-date with a last_used field no more than 48 hours behind
    setInterval(() => {this.queues = {};}, 25 * 60 * 60 * 1000);

    // Store claimQueue name, and remember if we've created it
    this.claimQueue         = options.claimQueue;
    this.claimQueueReady    = null;

    // Store resolvedQueue name, and remember if we've created it
    this.resolvedQueue      = options.resolvedQueue;
    this.resolvedQueueReady = null;

    // Store deadlineQueue name, and remember if we've created it
    this.deadlineQueue      = options.deadlineQueue;
    this.deadlineDelay      = options.deadlineDelay;
    this.deadlineQueueReady = null;

    // Keep a cache of pending counts as mapping:
    //    <provisionerId>/<workerType> -> {lastUpdated, count: promise}
    this.countPendingCache  = {};
  }

  _putMessage(queue, message, {visibility, ttl}) {
    var text = new Buffer(JSON.stringify(message)).toString('base64');
    return this.client.putMessage(queue, text, {
      visibilityTimeout:    visibility,
      messageTTL:           ttl,
    });
  }

  async _getMessages(queue, {visibility, count}) {
    var messages = await this.client.getMessages(queue, {
      visibilityTimeout:    visibility,
      numberOfMessages:     count,
    });
    return messages.map(msg => {
      return {
        payload:  JSON.parse(new Buffer(msg.messageText, 'base64')),
        remove:   this.client.deleteMessage.bind(
          this.client,
          queue,
          msg.messageId,
          msg.popReceipt,
        ),
        release:  this.client.updateMessage.bind(
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

  /** Ensure existence of the claim queue */
  ensureClaimQueue() {
    if (this.claimQueueReady) {
      return this.claimQueueReady;
    }
    var ready = this.client.createQueue(this.claimQueue).catch(err => {
      // Don't cache negative results
      this.claimQueueReady = null;
      throw err;
    });
    return this.claimQueueReady = ready;
  }

  /** Ensure existence of the resolved task queue */
  ensureResolvedQueue() {
    if (this.resolvedQueueReady) {
      return this.resolvedQueueReady;
    }
    var ready = this.client.createQueue(this.resolvedQueue).catch(err => {
      // Don't cache negative results
      this.resolvedQueueReady = null;
      throw err;
    });
    return this.resolvedQueueReady = ready;
  }

  /** Ensure existence of the deadline queue */
  ensureDeadlineQueue() {
    if (this.deadlineQueueReady) {
      return this.deadlineQueueReady;
    }
    var ready = this.client.createQueue(this.deadlineQueue).catch(err => {
      // Don't cache negative results
      this.deadlineQueueReady = null;
      throw err;
    });
    return this.deadlineQueueReady = ready;
  }

  /** Enqueue message to become visible when claim has expired */
  async putClaimMessage(taskId, runId, takenUntil) {
    assert(taskId,                      'taskId must be given');
    assert(typeof runId === 'number',   'runId must be a number');
    assert(takenUntil instanceof Date,  'takenUntil must be a date');
    assert(isFinite(takenUntil),        'takenUntil must be a valid date');

    await this.ensureClaimQueue();
    return this._putMessage(this.claimQueue, {
      taskId:             taskId,
      runId:              runId,
      takenUntil:         takenUntil.toJSON(),
    }, {
      ttl:                7 * 24 * 60 * 60,
      visibility:         secondsTo(takenUntil),
    });
  }

  /** Enqueue message ensure the dependency resolver handles the resolution */
  async putResolvedMessage(taskId, taskGroupId, schedulerId, resolution) {
    assert(taskId, 'taskId must be given');
    assert(taskGroupId, 'taskGroupId must be given');
    assert(schedulerId, 'schedulerId must be given');
    assert(resolution === 'completed' || resolution === 'failed' ||
           resolution === 'exception',
           'resolution must be completed, failed or exception');

    await this.ensureResolvedQueue();
    return this._putMessage(this.resolvedQueue, {
      taskId, taskGroupId, schedulerId, resolution,
    }, {
      ttl:                7 * 24 * 60 * 60,
      visibility:         0,
    });
  }

  /** Enqueue message to become visible when deadline has expired */
  async putDeadlineMessage(taskId, taskGroupId, schedulerId, deadline) {
    assert(taskId,                      'taskId must be given');
    assert(taskGroupId,                 'taskGroupId must be given');
    assert(schedulerId,                 'schedulerId must be given');
    assert(deadline instanceof Date,    'deadline must be a date');
    assert(isFinite(deadline),          'deadline must be a valid date');

    await this.ensureDeadlineQueue();
    var delay = Math.floor(this.deadlineDelay / 1000);
    debug('Put deadline message to be visible in %s seconds',
           secondsTo(deadline) + delay);
    return this._putMessage(this.deadlineQueue, {
      taskId,
      taskGroupId,
      schedulerId,
      deadline:           deadline.toJSON(),
    }, {
      ttl:                7 * 24 * 60 * 60,
      visibility:         secondsTo(deadline) + delay,
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
      count:                  32,
    });

    // Convert to neatly consumable format
    return messages.map(m => {
      return {
        taskId:       m.payload.taskId,
        runId:        m.payload.runId,
        takenUntil:   new Date(m.payload.takenUntil),
        remove:       m.remove,
      };
    });
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
    // Ensure the claim queue exists
    await this.ensureResolvedQueue();

    // Get messages
    var messages = await this._getMessages(this.resolvedQueue, {
      visibility:             10 * 60,
      count:                  32,
    });

    // Convert to neatly consumable format
    return messages.map(m => {
      return {
        taskId:       m.payload.taskId,
        taskGroupId:  m.payload.taskGroupId,
        schedulerId:  m.payload.schedulerId,
        resolution:   m.payload.resolution,
        remove:       m.remove,
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
      count:                  32,
    });

    // Convert to neatly consumable format
    return messages.map(m => {
      return {
        taskId:       m.payload.taskId,
        taskGroupId:  m.payload.taskGroupId,
        schedulerId:  m.payload.schedulerId,
        deadline:     new Date(m.payload.deadline),
        remove:       m.remove,
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
           'Expected provisionerId to be an identifier');
    assert(/^[A-Za-z0-9_-]{1,22}$/.test(workerType),
           'Expected workerType to be an identifier');

    // Hash identifier to 24 characters
    let hashId = (id) => {
      var h = crypto.createHash('sha256').update(id).digest();
      return base32.encode(h.slice(0, 15)).toString('utf-8').toLowerCase();
    };

    // Construct queue name prefix (add priority later)
    let namePrefix = [
      this.prefix,            // prefix all queues
      hashId(provisionerId),  // hash of provisionerId
      hashId(workerType),     // hash of workerType
      '',                     // priority, add 1 = normal, 5 = high
    ].join('-');

    // Mapping from priority to queue name
    let names = _.mapValues(PRIORITY_TO_CONSTANT, c => namePrefix + c);

    // Return and cache promise that we created this queue
    return this.queues[id] = Promise.all(_.map(names, queueName => {
      return this._ensureQueueAndMetadata(queueName, provisionerId, workerType);
    })).catch(err => {
      err.note = 'Failed to ensure azure queue in queueservice.js';
      this.monitor.reportError(err);

      // Don't cache negative results
      this.queues[id] = undefined;
      throw err;
    }).then(() => names);
  }

  /**
   * Ensure that queue with given name exists and has correct meta-data,
   * in particular regarding meta-data for expiration.
   *
   * We maintain following meta-data keys:
   *  * `provisioner_id`,
   *  * `worker_type`, and
   *  * `last_used` (tolerating 23 hours difference, updated every 25 hours)
   *
   * We delete queues if they have `last_used` > 10 days ago, this happens in
   * a periodic test tasks.
   */
  async _ensureQueueAndMetadata(queue, provisionerId, workerType) {
    // Fetch meta-data from queue, checking if it exists
    try {
      let {metadata} = await this.client.getMetadata(queue);

      // Check if meta-data is up-to-date
      var lastUsed = new Date(metadata.last_used);
      if (metadata.provisioner_id === provisionerId
          && metadata.worker_type === workerType
          && isFinite(lastUsed)
          && lastUsed.getTime() > Date.now() - 23 * 60 * 60 * 1000
      ) {
        return; // We're done as meta-data is present
      }

      // Update meta-data
      return this.client.setMetadata(queue, {
        provisioner_id: provisionerId,
        worker_type:    workerType,
        last_used:      taskcluster.fromNowJSON(),
      });
    } catch (err) {
      // We handle queue not found exceptions, because getMetadata is a HEA
      // request we don't get any error message payload, so we also accept 404
      // as implying the same.
      if (err.code !== 'QueueNotFound' &&
          err.statusCode !== 404) {
        throw err;
      }

      // Create the queue with correct meta-data
      try {
        await this.client.createQueue(queue, {
          provisioner_id: provisionerId,
          worker_type:    workerType,
          last_used:      taskcluster.fromNowJSON(),
        });
      } catch (err) {
        // If queue already exists, we must have been racing we assume meta-data
        // is up to date...
        if (err.code !== 'QueueAlreadyExists') {
          // We probably don't have report on all these. But we should
          // definitely report if we see a QueueBeingDeleted error
          err.queue = queue;
          err.provisionerId = provisionerId;
          err.workerType = workerType;
          this.monitor.reportError(err);
          throw err;
        }
      }
    }
  }

  /**
   * Remove all worker queues not used since `now - 10 days`.
   * Returns number of queues deleted.
   */
  async deleteUnusedWorkerQueues(now = new Date()) {
    assert(now instanceof Date, 'Expected now as Date object');
    let deleteIfNotUsedSince = now.getTime() - 10 * 24 * 60 * 60 * 1000;
    let deleted = 0; // Number of queues deleted

    // Iterate through all pages
    let marker = undefined;
    do {
      // List queues with prefix from marker
      let {queues, nextMarker} = await this.client.listQueues({
        marker,
        prefix: this.prefix + '-',
        metadata: true,
      });

      // Set next marker
      marker = nextMarker;

      // Find queues to delete
      queues = queues.filter(({metadata}) => {
        // If meta-data is missing or 10 days old, we mark it for deletion
        var lastUsed = new Date(metadata.last_used);
        return (
             !metadata.provisioner_id
          || !metadata.worker_type
          || !isFinite(lastUsed)
          || lastUsed.getTime() < deleteIfNotUsedSince
        );
      });

      // Delete queues, if they are empty
      await Promise.all(queues.map(async ({name, metadata}) => {
        // Fetch message count (approximate)
        let {messageCount} = await this.client.getMetadata(name);
        if (messageCount > 0) {
          return; // Abort if there are messages
        }

        debug('Deleting queue %s with metadata: %j', name, metadata);
        await this.client.deleteQueue(name);

        // Count queues deleted (for test ability)
        deleted += 1;
      }));

      // Keep going until we get an `undefined` marker
    } while (marker);

    // Return number of queues deleted
    return deleted;
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

    // Find name of azure queue
    var queueNames = await this.ensurePendingQueue(
      task.provisionerId,
      task.workerType,
    );

    // Find the time to deadline
    var timeToDeadline = secondsTo(task.deadline);
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
    return this._putMessage(queueNames[task.priority], {
      taskId:     task.taskId,
      runId:      runId,
    }, {
      ttl:          timeToDeadline,
      visibility:   0,
    });
  }

  /** Get signed URLs for polling and deleting from the azure queue */
  async signedPendingPollUrls(provisionerId, workerType) {
    // Find name of azure queue
    var queueNames = await this.ensurePendingQueue(provisionerId, workerType);

    // Set start of the signature to 15 min in the past
    var start = new Date();
    start.setMinutes(start.getMinutes() - 15);

    // Set the expiry of the signature to 30 min in the future
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 30);

    // Find visibility timeout we'll encoding in signed poll URLs
    var pendingPollTimeout = Math.floor(this.pendingPollTimeout / 1000);

    // For each queue name, return signed URLs for the queue

    let queues = PRIORITIES.map(priority => {
      let queueName = queueNames[priority];

      // Create shared access signature
      var sas = this.client.sas(queueName, {
        start, expiry,
        permissions: {
          process:    true,
        },
      });
      // Construct signed url
      return {
        signedPollUrl: url.format({
          protocol:       'https',
          host:           `${this.accountName}.queue.core.windows.net`,
          pathname:       `/${queueName}/messages`,
          search:         `?visibilitytimeout=${pendingPollTimeout}&${sas}`,
        }),
        signedDeleteUrl: url.format({
          protocol:       'https',
          host:           `${this.accountName}.queue.core.windows.net`,
          pathname:       `/${queueName}/messages/{{messageId}}`,
          search:         `?popreceipt={{popReceipt}}&${sas}`,
        }),
      };
    });

    // Return queues and expiry
    return {queues, expiry};
  }

  /**
   * Return pending queues as list of poll(count) in order of priority.
   *
   * A poll(count) function returns up-to count messages, where each message
   * is on the form:
   * {
   *   taskId:  '...',        // taskId from the message
   *   runId:   0,            // runId from the message
   *   remove:  function() {} // Async function to delete the message
   *   release: function() {} // Async function that makes the message visible
   * }
   */
  async pendingQueues(provisionerId, workerType) {
    // Find names of azure queues
    let queueNames = await this.ensurePendingQueue(
      provisionerId, workerType,
    );
    // Order by priority (and convert to array)
    let queues = PRIORITIES.map(priority => queueNames[priority]);

    // For each queue, return poll(count) function
    return queues.map(queue => {
      return async (count) => {
        // Get messages
        let messages = await this._getMessages(queue, {
          visibility: 5 * 60,
          count,
        });
        return messages.map(m => {
          return {
            taskId:   m.payload.taskId,
            runId:    m.payload.runId,
            remove:   m.remove,
            release:  m.release,
          };
        });
      };
    });
  }

  /** Returns promise for number of messages pending in pending task queue */
  async countPendingMessages(provisionerId, workerType) {
    // Find cache entry
    let cacheKey = provisionerId + '/' + workerType;
    let entry = this.countPendingCache[cacheKey] || {
      count: Promise.resolve(0),
      lastUpdated: 0,
    };
    this.countPendingCache[cacheKey] = entry;

    // Update count if more than 20 seconds old
    if (Date.now() - entry.lastUpdated > 20 * 1000) {
      entry.lastUpdated = Date.now();
      entry.count = (async () => {
        // Find name of azure queue
        let queueNames = await this.ensurePendingQueue(provisionerId, workerType);

        // Find messages count queues
        let results = await Promise.all(_.map(queueNames, queueName => {
          return this.client.getMetadata(queueName);
        }));

        // Sum up the messageCount property
        return _.sumBy(results, 'messageCount');
      })();
    }

    // Wait for result and return it
    return await entry.count;
  }
};

// Export QueueService
module.exports = QueueService;
