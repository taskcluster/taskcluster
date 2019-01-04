const assert = require('assert');
const taskcluster = require('taskcluster-client');
const debug = require('debug')('index:handlers');
const _ = require('lodash');
const helpers = require('./helpers');
const {consume} = require('taskcluster-lib-pulse');

/**
 * Create handlers
 *
 * options:
 * {
 *   IndexedTask:        // data.IndexedTask
 *   Namespace:          // data.Namespace
 *   queue:              // taskcluster.Queue
 *   queueEvents:        // taskcluster.QueueEvents instance
 *   credentials:        // Pulse credentials
 *   queueName:          // Queue name (optional)
 *   routePrefix:        // Routing-key prefix for "route.<routePrefix>.#"
 *   monitor:            // base.monitor({...})
 * }
 */
var Handlers = function(options) {
  // Validate options
  assert(options.IndexedTask, 'A subclass of data.IndexedTask is required');
  assert(options.Namespace, 'A subclass of data.Namespace is required');
  assert(options.queue, 'An instance of taskcluster.Queue is required');
  assert(options.queueEvents instanceof taskcluster.QueueEvents,
    'An instance of taskcluster.QueueEvents is required');
  assert(options.credentials, 'credentials must be provided');
  assert(options.routePrefix, 'routePrefix is required');
  assert(options.monitor, 'monitor is required for statistics');
  // Store options on this for use in event handlers
  this.IndexedTask = options.IndexedTask;
  this.Namespace = options.Namespace;
  this.queue = options.queue;
  this.queueEvents = options.queueEvents;
  this.credentials = options.credentials;
  this.routePrefix = options.routePrefix;
  this.queueName = options.queueName;
  this.monitor = options.monitor;
  this.pq = null;
  // Binding for completed tasks
  this.binding = options.queueEvents.taskCompleted(`route.${options.routePrefix}.#`);
  this.pulseClient = options.pulseClient;
};

/** Setup handlers and start listening */
Handlers.prototype.setup = async function() {
  assert(this.pq === null, 'Cannot setup twice!');

  // Create regular expression for parsing routes
  this.routeRegexp = new RegExp('^' + this.routePrefix + '\\.(.*)$');

  this.pq = await consume(
    {
      client: this.pulseClient,
      bindings: [this.binding],
      queueName: this.queueName,
    },
    this.monitor.timedHandler('listener', this.messageHandler.bind(this)),
  );

  debug('Handler listening for pulse messages');
};

Handlers.prototype.terminate = async function() {
  debug('Terminating handlers...');
  if (this.pq) {
    await this.pq.stop();
    this.pq = null;
  }
};

/** Handle notifications of completed messages */
Handlers.prototype.completed = function(message) {
  var that = this;

  // Find namespaces to index under
  var namespaces = message.routes.filter(function(route) {
    return that.routeRegexp.test(route);
  }).map(function(route) {
    return that.routeRegexp.exec(route)[1];
  }).filter(function(namespace) {
    return helpers.namespaceFormat.test(namespace);
  });

  // If there is no namespace we better log this
  if (namespaces.length === 0) {
    debug('Didn\'t find any valid namespaces for message: %j', message);
    return;
  }

  // Get task definition
  return this.queue.task(message.payload.status.taskId).then(function(task) {

    // Create default expiration date
    var expires;
    if (task.expires) {
      expires = new Date(task.expires);
    } else {
      expires = new Date(task.created);
      expires.setDate(expires.getDate() + 365);
    }

    // Get `index` from `extra` section
    var options = _.defaults({}, (task.extra || {}).index || {}, {
      rank: 0,
      expires: expires.toJSON(),
      data: {},
    });

    // Parse expiration date
    expires = new Date(options.expires);

    // Check that we have a number
    if (typeof options.rank !== 'number') {
      debug('Expected number from task.extra.index.rank, failing on %j',
        message);
      return;
    }

    // Check that data is an object
    if (typeof options.data !== 'object') {
      debug('Expected object from task.extra.index.data, failed on %j',
        message);
      return;
    }

    // Insert everything into the index
    return Promise.all(namespaces.map(function(namespace) {
      return helpers.insertTask(namespace, {
        taskId: message.payload.status.taskId,
        data: options.data,
        expires: expires,
        rank: options.rank,
      }, that);
    })).then(function() {
      debug('Indexed: %s', message.payload.status.taskId);
    });
  });
};

/** Message handler **/
Handlers.prototype.messageHandler = function(message) {
  if (message.exchange === this.binding.exchange) {
    return this.completed(message);
  }
  debug('WARNING: received message from unexpected exchange: %s, message: %j',
    message.exchange, message);
  throw new Error('Got message from unexpected exchange: ' +
    message.exchange);
};

// Export Handlers
module.exports = Handlers;
