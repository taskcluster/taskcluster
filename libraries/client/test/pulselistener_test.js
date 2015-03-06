suite('PulseListener', function() {
  var taskcluster     = require('../');
  var Promise         = require('promise');
  var assert          = require('assert');
  var mockEvents      = require('./mockevents');
  var slugid          = require('slugid');
  var debug           = require('debug')('test:listener');
  var base            = require('taskcluster-base');

  this.timeout(60 * 1000);

  // Load configuration
  var cfg = base.config({
    defaults:     {},
    profile:      {},
    filename:     'taskcluster-client'
  });

  if(!cfg.get('pulse:password')) {
    console.log("Skipping PulseListener tests due to missing config");
    return;
  }

  // Pulse credentials
  var credentials = {
    username:   cfg.get('pulse:username'),
    password:   cfg.get('pulse:password')
  };

  var connectionString = [
    'amqps://',         // Ensure that we're using SSL
    cfg.get('pulse:username'),
    ':',
    cfg.get('pulse:password'),
    '@',
    'pulse.mozilla.org',
    ':',
    5671                // Port for SSL
  ].join('');

  var exchangePrefix = [
    'exchange',
    cfg.get('pulse:username'),
    'taskcluster-client',
    'test'
  ].join('/') + '/';

  mockEvents.configure({
    connectionString:       connectionString,
    exchangePrefix:         exchangePrefix
  });

  var _publisher = null;
  setup(function() {
    mockEvents.configure({
      connectionString:       connectionString,
      exchangePrefix:         exchangePrefix
    });
    debug("Connecting");
    return mockEvents.connect().then(function(publisher) {
      debug("Connected");
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
    assert(info.exchange === exchangePrefix + 'test-exchange');
    assert(info.routingKeyPattern === 'my-constant.test.#.*.*');
  });

  // Test that binding info is generated with number as routing keys
  test('binding info with number', function() {
    var info = mockEventsClient.testExchange({testId: 0});
    assert(info.exchange === exchangePrefix + 'test-exchange');
    assert(info.routingKeyPattern === 'my-constant.0.#.*.*');
  });


  test('bind via connection string', function() {
    var listener = new taskcluster.PulseListener({
      credentials: {
        namespace:            cfg.get('pulse:username'),
        connectionString:     connectionString
      }
    });

    return listener.resume().then(function() {
      return listener.close();
    });
  });

  // Bind and listen with listener
  test('bind and listen', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: '#'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: 'route.test'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind(mockEventsClient.testExchange('route.test'));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routes[0] === 'test');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: 'my-constant.#'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: 'another.routing.key'
    });

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        reject(new Error("Didn't expect message"));
      });
      listener.on('error', function(err) {
        reject(err);
      });
      listener.connect().then(function() {
        setTimeout(accept, 1500);
      }, reject);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      queueName:            slugid.v4(),
      credentials:          credentials
    });
    listener.bind(mockEventsClient.testExchange({testId: 'test'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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

    return Promise.all([published, result]).then(function() {
      return listener.deleteQueue();
    });
  });

  test('deletion of named queue', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      queueName:            slugid.v4(),
      credentials:          credentials
    });

    return listener.deleteQueue();
  });

  // Test routing with multi key
  test('multi-word routing', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind(mockEventsClient.testExchange({taskRoutingKey: '*.world'}));

    var result = new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        assert(message.payload.text == "my message");
        assert(message.routing, "Failed to parse routing key");
        assert(message.routing.taskRoutingKey == 'hello.world');
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
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

  // Test listener without multi-word
  test('parse without multi-words', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind(mockEventsClient.simpleTestExchange({testId: 'test'}));

    var result = new Promise(function(accept, reject) {
      listener.once('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
      });
      listener.once('error', function(err) {
        reject(err);
      });
    });

    var published = listener.resume().then(function() {
      return _publisher.simpleTestExchange({
        text:           "my message"
      }, {
        testId:         'test'
      });
    });

    return Promise.all([published, result]);
  });

  // Test listener without any routing keys
  test('parse without any routing keys', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind(mockEventsClient.reallySimpleTestExchange());

    var result = new Promise(function(accept, reject) {
      listener.once('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
      });
      listener.once('error', function(err) {
        reject(err);
      });
    });

    var published = listener.resume().then(function() {
      return _publisher.reallySimpleTestExchange({
        text:           "my message"
      });
    });

    return Promise.all([published, result]);
  });

  // Test listener.once
  test('bind and listen  (using listener.once)', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      credentials:          credentials
    });
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: '#'
    });

    var result = new Promise(function(accept, reject) {
      listener.once('message', function(message) {
        assert(message.payload.text == "my message");
        setTimeout(function() {
          listener.close().then(accept, reject)
        }, 500);
      });
      listener.once('error', function(err) {
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
    // Create listener
    var listener = new taskcluster.PulseListener({
      queueName:            slugid.v4(),
      credentials:          credentials
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
          }, 500);
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
        return new Promise(function(accept) {setTimeout(accept, 500);});
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
        return new Promise(function(accept) {setTimeout(accept, 500);});
      }).then(function() {
        assert(count == 2, "Should have two messages now");
        return listener.resume();
      });
    });
    return Promise.all([published, result]).then(function() {
      return listener.deleteQueue();
    });
  });

  // Test pause and resume
  test('pause/resume with maxLength', function() {
    // Create listener
    var listener = new taskcluster.PulseListener({
      queueName:            slugid.v4(),
      credentials:          credentials,
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
          }, 500);
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
        return new Promise(function(accept) {setTimeout(accept, 500);});
      }).then(function() {
        return listener.resume();
      }).then(function() {
        return result;
      }).then(function() {
        assert(count == 3, "We should only have got 3 messages");
      });
    }).then(function() {
      return listener.deleteQueue();
    });
  });


  test('connection w. two consumers', function() {
    // Create connection object
    var connection = new taskcluster.PulseConnection(credentials);

    // Create listeners
    var listener1 = new taskcluster.PulseListener({
      connection:           connection
    });
    listener1.bind(mockEventsClient.testExchange({testId: 'test1'}));
    var listener2 = new taskcluster.PulseListener({
      connection:           connection
    });
    listener2.bind(mockEventsClient.testExchange({testId: 'test2'}));

    var result1 = new Promise(function(accept, reject) {
      listener1.on('message', function(message) {
        debug("got message 1");
        assert(message.payload.text == "my message 1");
        setTimeout(function() {
          listener1.close().then(accept, reject)
        }, 500);
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
        }, 500);
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
