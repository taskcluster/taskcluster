var azure       = require('azure-storage');
var _           = require('lodash');
var Promise     = require('promise');
var debug       = require('debug')('queue:queue');
var assert      = require('assert');
var base32      = require('thirty-two');
var querystring = require('querystring');

/** Decode Url-safe base64, our identifiers satisfies these requirements */
var decodeUrlSafeBase64 = function(data) {
  return new Buffer(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

/**
 * Create convenient azure queue storage wrapper.
 * options:
 * {
 *   prefix:               // Prefix for all queues, max 6 chars
 *   credentials: {
 *     accountName:        // Azure storage account name
 *     accountKey:         // Azure storage account key
 *   }
 * }
 */
var QueueService = function(options) {
  assert(options, "options is required");
  assert(/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(options.prefix), "Invalid prefix");
  assert(options.prefix.length <= 6, "Prefix is too long");
  this.prefix = options.prefix;

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
};

// Export QueueService
module.exports = QueueService;

/** Ensure existence of a queue */
QueueService.prototype.ensureQueue = function(provisionerId, workerType) {
  // Construct id, note that slash cannot be used in provisionerId, workerType
  var id = provisionerId + '/' + workerType;

  // Find promise
  var retval = this.queues[id];

  // Create promise, if it doesn't exist
  if (!retval) {
    assert(/^[A-Za-z0-9_-]{1,22}$/.test(provisionerId), "Expected identifier");
    assert(/^[A-Za-z0-9_-]{1,22}$/.test(workerType), "Expected identifier");
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

    var that = this;
    this.queues[id] = retval = new Promise(function(accept, reject) {
      that.service.createQueueIfNotExists(name, {}, function(err) {
        if (err) {
          // Don't cache negative results
          that.queues[id] = undefined;
          return reject(err);
        }
        accept(name);
      });
    });
  }

  // Return promise
  return retval;
};

/** Put a message into a queue */
QueueService.prototype.putMessage = function(provisionerId, workerType,
                                             msg, deadline) {
  assert(deadline instanceof Date, "deadline must be a date");
  assert(isFinite(deadline), "deadline must be a valid date");
  var ttl = Math.floor((deadline.getTime() - new Date().getTime()) / 1000);
  var that = this;
  return this.ensureQueue(provisionerId, workerType).then(function(name) {
    return new Promise(function(accept, reject) {
      that.service.createMessage(name, JSON.stringify(msg), {
        messagettl:         ttl,
        visibilityTimeout:  0
      }, function(err) {
        if(err) {
          return reject(err);
        }
        accept();
      });
    });
  });
};


QueueService.prototype.signedUrl = function(provisionerId, workerType) {
  // Set start of the signature to 15 min in the past
  var start = new Date();
  start.setMinutes(start.getMinutes() - 15);

  // Set the expiry of the signature to 30 min in the future
  var expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 30);

  var that = this;
  return this.ensureQueue(provisionerId, workerType).then(function(name) {
    var sas = that.service.generateSharedAccessSignature(name, {
      AccessPolicy: {
        Permissions:  azure.QueueUtilities.SharedAccessPermissions.PROCESS,
        Start:        start,
        Expiry:       expiry
      }
    });

    return {
      getMessage: [
        'https://',
        that.accountName,
        '.queue.core.windows.net/',
        name,
        '/messages?numofmessages=1&visibilitytimeout=300&',
        sas
      ].join(''),
      deleteMessage: [
        'https://',
        that.accountName,
        '.queue.core.windows.net/',
        name,
        '/messages/<messageId>?popreceipt=<receipt>&',
        sas
      ].join(''),
      expiry: expiry
    };
  });
};
