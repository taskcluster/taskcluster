suite('listener', function() {
  var taskcluster     = require('../');
  var Promise         = require('promise');
  var assert          = require('assert');
  var mockEvents      = require('./mockevents');
  var slugid          = require('slugid');
  var debug           = require('debug')('test:listener');

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

  // Test that binding info is generated with number as routing keys
  test('binding info with number', function() {
    var info = mockEventsClient.testExchange({testId: 0});
    assert(info.exchange = 'taskcluster-client/test/test-exchange');
    assert(info.routingKeyPattern = '0.#.*.*');
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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all([published, result]);
  });

  // Bind and listen with listener (for CC)
  test('bind and listen (for CC)', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind({
      exchange: 'taskcluster-client/test/test-exchange',
      routingKeyPattern: 'route.test'
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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      }, ['route.test']);
    });

    return Promise.all([published, result]);
  });

  // Bind and listen with listener (for CC using client)
  test('bind and listen (for CC using client)', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind(mockEventsClient.testExchange('route.test'));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routes[0] === 'test');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 200);
      });
      listener.on('error', function(err) {
        reject(err);
      });
    });

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      }, ['route.test']);
    });

    return Promise.all([published, result]);
  });

  // Bind and listen with listener (manual routing key)
  test('bind and listen (manual constant routing key)', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind({
      exchange: 'taskcluster-client/test/test-exchange',
      routingKeyPattern: 'my-constant.#'
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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all([published, result]);
  });

  // Bind and listen with listener and non-match routing
  test('bind and listen (without wrong routing key)', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      connectionString:     mockEvents.connectionString
    });
    listener.bind({
      exchange: 'taskcluster-client/test/test-exchange',
      routingKeyPattern: 'another.routing.key'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        reject(new Error("Didn't expect message"));
      });
      listener.on('error', function(err) {
        reject(err);
      });
      setTimeout(accept, 500);
    }).then(function() {
      return listener.close();
    });

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      }, ['route.test']);
    });

    return Promise.all([published, result]);
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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all([published, result]);
  });

  // Naive test that creation work when providing a name for the queue
  test('named queue', function() {
    this.timeout(3000);

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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all([published, result]);
  });

  test('deletion of named queue', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      queueName:            slugid.v4(),
      connectionString:     mockEvents.connectionString
    });

    return listener.deleteQueue();
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

    var published = listener.resume().then(function() {
      return _publisher.testExchange({
        text:           "my message"
      }, {
        testId:         'test',
        taskRoutingKey: 'hello.world'
      });
    });

    return Promise.all([published, result]);
  });


  // Test pause and resume
  test('pause/resume', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      queueName:            slugid.v4(),
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

    var published = listener.resume().then(function() {
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
    return Promise.all([published, result]);
  });

  // Test pause and resume
  test('pause/resume with maxLength', function() {
    this.timeout(1500);

    // Create listener
    var listener = new taskcluster.Listener({
      queueName:            slugid.v4(),
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

    return listener.resume().then(function() {
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


  test('connection w. two consumers', function() {
    this.timeout(3000);

    // Create connection object
    var connection = new taskcluster.Connection({
      connectionString:     mockEvents.connectionString
    });

    // Create listeners
    var listener1 = new taskcluster.Listener({
      connection:           connection
    });
    listener1.bind(mockEventsClient.testExchange({testId: 'test1'}));
    var listener2 = new taskcluster.Listener({
      connection:           connection
    });
    listener2.bind(mockEventsClient.testExchange({testId: 'test2'}));

    var result1 = new Promise(function(accept, reject) {
      listener1.on('message', function(message) {
        debug("got message 1");
        assert(message.payload.text == "my message 1");
        setTimeout(function() {
          listener1.close().then(accept, reject)
        }, 200);
      });
      listener1.on('error', function(err) {
        reject(err);
      });
    });

    var result2 = new Promise(function(accept, reject) {
      listener2.on('message', function(message) {
        debug("got message 2");
        assert(message.payload.text == "my message 2");
        setTimeout(function() {
          listener2.close().then(accept, reject)
        }, 200);
      });
      listener2.on('error', function(err) {
        reject(err);
      });
    });

    return Promise.all([
      listener1.resume(),
      listener2.resume()
    ]).then(function() {
      debug("Sending message 1");
      return _publisher.testExchange({
        text:           "my message 1"
      }, {
        testId:         'test1',
        taskRoutingKey: 'hello.world'
      });
    }).then(function() {
      // Wait for listener 1 to get message and close
      return result1;
    }).then(function() {
      return _publisher.testExchange({
        text:           "my message 2"
      }, {
        testId:         'test2',
        taskRoutingKey: 'hello.world'
      });
    }).then(function() {
      return result2;
    }).then(function() {
      return connection.close();
    });
  });
});
