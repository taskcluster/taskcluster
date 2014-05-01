suite('queue/events', function() {
  var assert    = require('assert');
  var nconf     = require('../../config/test')();
  var amqp      = require('amqp');
  var Promise   = require('promise');
  var events    = require('../../queue/events');
  var debug     = require('debug')('tests:events');
  var validate  = require('../../utils/validate');

  var subject;
  setup(function() {
    debug("Setting up exchanges with events.setup()");
    validate.setup();

    return events.connect(nconf.get('amqp:url')).then(function(_subject) {
      debug("Exchange setup completed!");
      subject = _subject;
    });
  });

  teardown(function() {
    return subject.disconnect().then(function() {
      debug("Disconnected from RabbitMQ");
    });
  });

  test('#task-pending', function() {
    // Publish a message
    debug('Publishing to task-pending');

    return subject.publish('task-pending', {
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
    });
  });

  test('task-pending validation test', function() {
    // Publish a message
    debug('Publishing to task-pending');

    return subject.publish('task-pending', {
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
    }).then(
      function() {
        throw new Error("Invalid message was sent, this is bad!");
      },
      // catch the error so it does not fail the test we expect failure
      // here
      function() {}
    );
  });

  suite('task-pending receive test', function() {
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
    return subscribed.then(function() {
      debug('Publishing to task-pending');
      subject.publish('task-pending', {
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
      });
    });
  });
});
