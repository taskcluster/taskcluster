suite('WebListener', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var taskcluster = require('../');
  var debug       = require('debug')('test:WebListener');
  var base        = require('taskcluster-base');
  var mockEvents  = require('./mockevents');

  // Load configuration
  var cfg = base.config();

  if(!cfg.pulse.password) {
    console.log("Skipping PulseListener tests due to missing config");
    this.pending = true;
  }

  var connectionString = [
    'amqps://',         // Ensure that we're using SSL
    cfg.pulse.username,
    ':',
    cfg.pulse.password,
    '@',
    'pulse.mozilla.org',
    ':',
    5671                // Port for SSL
  ].join('');

  var exchangePrefix = [
    'exchange',
    cfg.pulse.username,
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

  // Test against localhost if you want to
  var baseUrl = undefined; //'http://localhost:60002/v1';

  test('create WebListener', function() {
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
    assert(listener);
  });

  test('connect and close', function() {
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
    return listener.connect().then(function() {
      return listener.close();
    });
  });

  // Bind and listen with listener
  test('bind and listen', function() {
    // Create listener
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
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
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
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
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
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
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
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
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
    listener.bind({
      exchange: exchangePrefix + 'test-exchange',
      routingKeyPattern: 'another.routing.key'
    });

    return new Promise(function(accept, reject) {
      listener.on('message', function(message) {
        reject(new Error("Didn't expect message"));
      });
      listener.on('error', function(err) {
        reject(err);
      });
      listener.resume().then(function() {
        setTimeout(accept, 1500);
        return _publisher.testExchange({
          text:           "my message"
        }, {
          testId:         'test',
          taskRoutingKey: 'hello.world'
        }, ['route.test']);
      });
    }).then(function() {
      return listener.close();
    });
  });

  // Test listener.once
  test('bind and listen (using listener.once)', function() {
    // Create listener
    var listener = new taskcluster.WebListener({baseUrl: baseUrl});
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
});