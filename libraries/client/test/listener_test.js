suite('listener', function() {
  var taskcluster     = require('../');
  var Promise         = require('promise');
  var assert          = require('assert');
  var mockEvents      = require('./mockevents');
  var slugid          = require('slugid');

  var _publisher = null;
  setup(function() {
    return mockEvents.connect().then(function(publisher) {
      _publisher = publisher;
    });
  });
  teardown(function() {
    return _publisher.close().then(function() {
      _publisher = null;
    });
  });
  var reference = mockEvents.reference();

  // Create client from reference
  var MockEventsClient = taskcluster.createClient(reference);
  var mockEventsClient = new MockEventsClient();

  // Test that client provides us with binding information
  test('binding info', function() {
    var info = mockEventsClient.testExchange({testId: 'test'});
    assert(info.exchange = 'taskcluster-client/test/test-exchange');
    assert(info.routingKeyPattern = 'test.#.*.*');
  });

  // Bind and listen with listener
  test('bind and listen', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind({
      exchange: 'taskcluster-client/test/test-exchange',
      routingKeyPattern: '#'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 200);
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.connect().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all(published, result);
  });

  // Test that routing key can be parsed if proper information is provided
  test('parse routing key', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 200);
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.connect().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all(published, result);
  });

  // Naive test that creation work when providing a name for the queue
  test('named queue', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      queueName:            slugid.v4(),
      connectionString:     mockEvents.connectionString
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 200);
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.connect().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all(published, result);
  });

  // Test routing with multi key
  test('multi-word routing', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind(mockEventsClient.testExchange({taskRoutingKey: '*.world'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 200);
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.connect().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all(published, result);
  });


  // Test pause and resume
  test('pause/resume', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var count = 0;
    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        count += 1;
        if (count == 4) {
          setTimeout(function() {
            listener.close().then(accept, reject)
          }, 200);
        }
        assert(count <= 4, "Shouldn't get more than 4 messages");
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.connect().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      }).then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return new Promise(function(accept) {setTimeout(accept, 200);});
      }).then(function() {
        assert(count == 2, "Should have two messages now");
        return listener.pause();
      }).then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return new Promise(function(accept) {setTimeout(accept, 200);});
      }).then(function() {
        assert(count == 2, "Should have two messages now");
        return listener.resume();
      });
    });
    return Promise.all(published, result);
  });

  // Test pause and resume
  test('pause/resume with maxLength', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString,
      maxLength:            3
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var count = 0;
    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        count += 1;
        assert(count <= 3, "Shouldn't get more than 3 messages");
        if (message.payload.text == "end") {
          setTimeout(function() {
            listener.close().then(accept, reject)
          }, 200);
        }
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    return listener.connect().then(function() {
      return listener.pause().then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return _publisher.testExchange({
          text:           "end"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        });
      }).then(function() {
        return new Promise(function(accept) {setTimeout(accept, 200);});
      }).then(function() {
        return listener.resume();
      }).then(function() {
        return result;
      }).then(function() {
        assert(count == 3, "We should only have got 3 messages");
      });
    });
  });
});
