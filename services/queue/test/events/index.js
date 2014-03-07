var nconf     = require('nconf');
var amqp      = require('amqp');
var Promise   = require('promise');
var server    = require('../../server');
var events    = require('../../queue/events');
var debug     = require('debug')('tests:events');
var validate  = require('../../utils/validate');

/** Setup events */
exports.setUp = function(callback)  {
  debug("Setting up exchanges with events.setup()");
  validate.setup();
  events.setup().then(function() {
    debug("Exchange setup completed!");
    callback();
  });
}

/** Disconnect from RabbitMQ, so we can exit the process */
exports.tearDown = function(callback) {
  debug("Disconnecting from RabbitMQ");
  events.disconnect().then(function() {
    debug("Disconnected from RabbitMQ");
    callback();
  });
}

/** Test message publication */
exports['task-pending'] = function(test) {
  test.expect(1);

  // Publish a message
  debug('Publishing to task-pending');
  events.publish('task-pending', {
    "version":              "0.2.0",
    "status": {
      "taskId":             "w0mNqBW9QLGD5TL1srCK8w",
      "provisionerId":      "jonasfj-test-provId",
      "workerType":         "jonasfj-test-worker",
      "runs":               [],
      "state":              "pending",
      "reason":             "none",
      "routing":            "jonasfjs-precious-tasks.stupid-test.aws",
      "retries":            0,
      "timeout":            30,
      "priority":           2.6,
      "created":            "2014-02-01T03:22:36.356Z",
      "deadline":           "2014-03-01T03:22:36.356Z",
      "takenUntil":         "1970-01-01T00:00:00.000Z"
    }
  }).then(function() {
    test.ok(true, "Message was sent, how nice");
  }, function(err) {
    test.ok(false, "Failed to send message!" + err);
  }).then(function() {
    test.done();
  });
};

/** Test that invalid message publication fails */
exports['task-pending validation test'] = function(test) {
  test.expect(1);

  // Publish a message
  debug('Publishing to task-pending');
  events.publish('task-pending', {
    "version":              "0.2.0",
    "status": {
      "taskId":             "w0mNqBW9QLGD5TL1srCK8w",
      "provisionerId":      "jonasfj-test-provId",
      "workerType":         "jonasfj-test-worker",
      "runs":               [],
      "state":              "pending",
      "reason":             "none",
      "routing":            "jonasfjs-precious-tasks.stupid-test.aws",
      "retries":            0,
      "timeout":            30,
      "priority":           2.6,
      "created":            "2014-02-01T03:22:36.356Z",
      "deadline":           "2014-03-01T03:22:36.356Z",
      "takenUntil":         null
    }
  }).then(function() {
    test.ok(false, "Invalid message was sent, this is bad!");
  }, function() {
    test.ok(true, "Failed to send message, as expected...");
  }).then(function() {
    test.done();
  });
};

/** Test that message can be received */
exports['task-pending receive test'] = function(test) {
  test.expect(1);

  // Create a connection
  var conn = null;
  var connected = new Promise(function(accept, reject) {
    // Create connection
    debug("Creating new AMQP connection!");
    conn = amqp.createConnection(nconf.get('amqp'));
    conn.on('ready', accept);
  });

  var queue = null;
  var subscribed = connected.then(function() {
    return new Promise(function(accept, reject) {
      debug('Create exclusive queue');
      queue = conn.queue("", {
        passive:                    false,
        durable:                    false,
        exclusive:                  true,
        autoDelete:                 true,
        closeChannelOnUnsubscribe:  true
      }, function() {
        debug('Subscribe to messages on queue');
        queue.subscribe(function(message) {
          test.ok(message.status.taskId == 'w0mNqBW9QLGD5TL1srCK8w',
                  "Didn't get the expected message");
          queue.destroy();
          conn.destroy();
          test.done();
        });
        debug('Bind queue to exchange');
        queue.bind(
          'queue/v1/task-pending',
          'w0mNqBW9QLGD5TL1srCK8w.#',
          function() {
            accept();
          }
        );
      });
    });
  });

  // Publish a message
  subscribed.then(function() {
    debug('Publishing to task-pending');
    events.publish('task-pending', {
      "version":              "0.2.0",
      "status": {
        "taskId":             "w0mNqBW9QLGD5TL1srCK8w",
        "provisionerId":      "jonasfj-test-provId",
        "workerType":         "jonasfj-test-worker",
        "runs":               [],
        "state":              "pending",
        "reason":             "none",
        "routing":            "jonasfjs-precious-tasks.stupid-test.aws",
        "retries":            0,
        "timeout":            30,
        "priority":           2.6,
        "created":            "2014-02-01T03:22:36.356Z",
        "deadline":           "2014-03-01T03:22:36.356Z",
        "takenUntil":         "1970-01-01T00:00:00.000Z"
      }
    }).then(null, function() {
      test.ok(false, "Message validation failed unexpectedly...");
    });
  });
};
