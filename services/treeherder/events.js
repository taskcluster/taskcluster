var Promise   = require('promise');
var nconf     = require('nconf');
var amqp      = require('amqp');
var request   = require('superagent-promise');
var assert    = require('assert');
var debug     = require('debug')('events');
var client     = require('taskcluster-client');
var handlers  = require('./handlers');

// Number of message to be working on concurrently
var PREFETCH_COUNT = 1;

// AMQP connection created by events.setup()
var _conn = null;

/**
 * Setup AMQP connection and declare the required exchanges, this returns a
 * promise that we're ready to publish messages.
 *
 * **Warning** the `node-amqp` library have some fairly limited error reporting
 * capability, so don't except this to fail. This isn't bad because failure to
 * setup exchanges is critical... Whether server crashes or loops doesn't really
 * matter to me.
 */
exports.setup = function() {
  // Connection created
  var conn = null;

  // Fetch connection string from queue and get a promise for a connection
  var connected = client.queue.getAMQPConnectionString().then(function(result) {
    return new Promise(function(accept, reject) {
      debug("Connecting to AMQP server");
      // Create connection
      conn = amqp.createConnection({url: result.url});
      conn.once('ready', function() {
        debug("Connection to AMQP is now ready for work");
        accept();
      });
    });
  });

  // Declare queue
  var queue = null;
  var queue_declared = connected.then(function() {
    return new Promise(function(accept, reject) {
      var queueName = nconf.get('treeherder:amqpQueueName');
      var hasName   = queueName !== undefined;
      queue = conn.queue(queueName || '', {
        passive:                    false,
        durable:                    hasName,
        exclusive:                  !hasName,
        autoDelete:                 !hasName,
        closeChannelOnUnsubscribe:  false
      }, function() {
        debug("Declared AMQP queue");
        accept();
      });
    });
  });


  // Subscribe to messages
  var subscribe_to_messages = queue_declared.then(function() {
    // Handle incoming messages and send them to handers
    queue.subscribe({
      ack:                true,
      prefetchCount:      PREFETCH_COUNT
    }, function(message, headers, deliveryInfo, raw) {
      // WARNING: Raw is not documented, but exposed and it is the only way
      // to handle more than one message at the time, as queue.shift() only
      // allows us to acknowledge the last message.
      debug("Received message from: %s with routingKey: %s",
            deliveryInfo.exchange, deliveryInfo.routingKey);

      // Check that this is for an exchange we want
      if (!handlers[deliveryInfo.exchange]) {
        debug("ERROR: Received message from exchange %s, which we bind to",
              deliveryInfo.exchange);
        raw.acknowledge();
        return;
      }

      // Handle the message
      try {
        Promise.from(handlers[deliveryInfo.exchange](message)).then(function() {
          // Acknowledge that message is completed
          debug("Acknowledging successfully handled message!");
          raw.acknowledge();
        }).catch(function(err) {
          var requeue = true;
          // Don't requeue if this has been tried before
          if (deliveryInfo.redelivered) {
            requeue = false;
            debug(
              "ERROR: Failed to handle message %j due to err: " +
              "%s, as JSON: %j, now rejecting message without requeuing!",
              message, err, err, err.stack
            );
          } else {
            debug(
              "WARNING: Failed to handle message %j due to err: " +
              "%s, as JSON: %j, now requeuing message",
              message, err, err, err.stack
            );
          }
          raw.reject(requeue);
        });
      }
      catch (err) {
        debug("Failed to handle message: %j, with err: %s",
              message, err, err.stack);
      }
    });
    debug("Subscribed to messages from queue");
  });

  // Bind queue to exchanges
  var setup_completed = subscribe_to_messages.then(function() {
    var key = nconf.get('treeherder:routingKeyPrefix');
    assert(key.length <= 22, "routingKeyPrefix is too long!");
    var routingPattern = '*.*.*.*.*.*.*.*.' + key + '.#';
    return new Promise(function(accept, reject) {
      debug('Binding to exchanges');
      // Only the last of the two binds will emit an event... this is crazy, but
      // I don't want to port to another AMQP library just yet.
      //queue.bind('scheduler/v1/task-graph-blocked', routingPattern);
      //queue.bind('scheduler/v1/task-graph-finished', routingPattern);
      //queue.bind('queue/v1/task-pending', routingPattern);
      queue.bind('scheduler/v1/task-graph-running', routingPattern);
      queue.bind('queue/v1/task-running', routingPattern);
      queue.bind('queue/v1/task-completed', routingPattern);
      queue.bind('queue/v1/task-failed', routingPattern, function() {
        debug('Bound queue to exchanges');
        accept();
      });
    });
  });

  return setup_completed.then(function() {
    // Set connection and exchange globally
    _conn = conn;
  });
};

/**
 * Disconnect from AMQP server, returns a promise of success
 * Mainly used for testing...
 */
exports.disconnect = function() {
  return new Promise(function(accept, reject) {
    _conn.on('close', function() {
      accept();
    });
    _conn.destroy();
  });
};
