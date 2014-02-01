var Promise   = require('promise');
var nconf     = require('nconf');
var amqp      = require('amqp');
var validate  = require('../utils/validate');

var debug   = require('debug')('queue:events');

// Exchanges setup by events.setup()
var _exchanges = null;

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
  debug('Connecting to AMQP server');

  // Get a promise that we'll be connected
  var connected = new Promise(function(accept, reject) {
    // Create connection
    var conn = amqp.createConnection(nconf.get('amqp'));
    conn.on('ready', function() {
      debug('Connection to AMQP is now ready for work');
      accept();
    });
  });

  // Create a dictionary for exchanges
  var exchanges = {};

  // When we're connected, let's defined exchanges
  connected.then(function() {
    // For each desired exchange we create a promise that the exchange will be
    // declared (we just carry name to function below as name, enjoy)
    var exchanges_declared_promises = [
      'task_pending_v1',
      'task_running_v1',
      'task_completed_v1',
      'task_failed_v1'
    ].map(function(name) {
      // Promise that exchange with `name` will be created
      return new Promise(function(accept, reject) {
        // For all intents and purposes these exchanges must be durable and
        // not auto deleted, they should never disappear!
        exchanges[name] = conn.exchange(name, {
          type:             'topic',
          durable:          true,
          confirm:          true,
          autoDelete:       false
        }, function() {
          accept();
        });
      });
    });

    // Return a promise that all exchanges have been configured
    return Promise.all(exchanges_declared_promises).then(function() {
      // Set exchange
      _exchanges = exchanges;
    });
  });
};

/** Publish a message to exchange with a given routing key */
exports.publish = function(exchange, routingKey, message) {
  // Check if exchanges are created, don't give a promise if exchanges aren't
  // setup...
  if (exchanges === null) {
    throw new Error("Exchanges are not setup yet, call events.setup()!");
  }

  return new Promise(function(accept, reject) {
    // Check if we're supposed to validate out-going messages
    if (nconf.get('queue:validate-outgoing')) {
      var schema = 'http://schemas.taskcluster.net/0.2.0/' + exchange
                    + '.json#';
      var errors = validate(message, schema);
      // Reject message if there's any errors
      if (errors) {
        reject(errors);
        return;
      }
    }
    // Publish message to RabbitMQ
    exchanges[exchange].publish(routingKey, message, {
      contentType:        'application/json',
      deliveryMode:       2,
    }, function(err) {
      if (err) {
        reject(new Error("Failed to send message"));
      } else {
        accept();
      }
    });
  });
};

