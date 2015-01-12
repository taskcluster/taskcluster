var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var Promise     = require('promise');
var debug       = require('debug')('index:handlers');
var _           = require('lodash');
var base        = require('taskcluster-base');
var helpers     = require('./helpers');

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
 *   drain:              // new base.Influx(...)
 *   component:          // Component name in statistics
 * }
 */
var Handlers = function(options) {
  // Validate options
  assert(options.IndexedTask, "A subclass of data.IndexedTask is required");
  assert(options.Namespace,   "A subclass of data.Namespace is required");
  assert(options.queue instanceof taskcluster.Queue,
         "And instance of taskcluster.Queue is required");
  assert(options.queueEvents instanceof taskcluster.QueueEvents,
         "An instance of taskcluster.QueueEvents is required");
  assert(options.credentials, "credentials must be provided");
  assert(options.credentials.username, "credentials.username must be provided");
  assert(options.credentials.password, "credentials.password must be provided");
  assert(options.routePrefix,       "routePrefix is required");
  assert(options.drain,             "statistics drains is required");
  assert(options.component,         "component name is needed for statistics");
  // Store options on this for use in event handlers
  this.IndexedTask      = options.IndexedTask;
  this.Namespace        = options.Namespace;
  this.queue            = options.queue;
  this.queueEvents      = options.queueEvents;
  this.credentials      = options.credentials;
  this.routePrefix      = options.routePrefix;
  this.queueName        = options.queueName;  // Optional
  this.drain            = options.drain;
  this.component        = options.component;
  this.listener         = null;
};

/** Setup handlers and start listening */
Handlers.prototype.setup = function() {
  assert(this.listener === null, "Cannot setup twice!");
  var that = this;

  // Create regular expression for parsing routes
  this.routeRegexp = new RegExp('^' + this.routePrefix + '\\.(.*)$');

  // Create listener
  this.listener = new taskcluster.PulseListener({
    credentials:          this.credentials,
    queueName:            this.queueName
  });

  // Binding for completed tasks
  var completedBinding = this.queueEvents.taskCompleted(
    'route.' + this.routePrefix + '.#'
  );
  this.listener.bind(completedBinding);

  // Create message handler
  var handler = function(message) {
    if (message.exchange === completedBinding.exchange) {
      return that.completed(message);
    }
    debug("WARNING: received message from unexpected exchange: %s, message: %j",
          message.exchange, message);
    throw new Error("Got message from unexpected exchange: " +
                    message.exchange);
  };

  // Create timed handler for statistics
  var timedHandler = base.stats.createHandlerTimer(handler, {
    drain:      this.drain,
    component:  this.component
  });

  // Listen for messages and handle them
  this.listener.on('message', timedHandler);

  // Start listening
  return this.listener.connect().then(function() {
    return that.listener.resume();
  });
};

// Export Handlers
module.exports = Handlers;


/** Handle notifications of completed messages */
Handlers.prototype.completed = function(message) {
  var that = this;

  // Find namespaces to index under
  var namespaces = message.routes.filter(function(route) {
    return that.routeRegexp.test(route);
  }).map(function(route) {
    return that.routeRegexp.exec(route)[1];
  });

  // If there is no namespace we better log this
  if (namespaces.length === 0) {
    debug("Didn't find any valid namespaces for message: %j", message);
    return;
  }

  // Get task definition
  return this.queue.getTask(message.payload.status.taskId).then(function(task) {
    // Create default expiration date
    var expires = new Date();
    expires.setDate(expires.getDate() + 365);

    // Get `index` from `extra` section
    var options = _.defaults({}, (task.extra || {}).index || {}, {
      rank:     0,
      expires:  expires.toJSON(),
      data:     {}
    });

    // Parse expiration date
    expires = new Date(options.expires);

    // Check that we have a number
    if (typeof(options.rank) !== 'number') {
      debug("Expected number from task.extra.index.rank, failing on %j",
            message);
      return;
    }

    // Check that data is an object
    if (typeof(options.data) !== 'object') {
      debug("Expected object from task.extra.index.data, failed on %j",
            message);
      return;
    }

    // Insert everything into the index
    return Promise.all(namespaces.map(function(namespace) {
      return helpers.insertTask(namespace, {
        taskId:   message.payload.status.taskId,
        data:     options.data,
        expires:  expires,
        rank:     options.rank
      }, that);
    })).then(function() {
      debug("Indexed: %s", message.payload.status.taskId);
    });
  });
};

