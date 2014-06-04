suite("Exchanges.Publisher", function() {
  var assert  = require('assert');
  var base    = require('../');
  var path    = require('path');
  var fs      = require('fs');
  var debug   = require('debug')('base:test:publisher');
  var Promise = require('promise');

  // AMQP connection string for localhost in various test setups
  var connectionString = 'amqp://guest:guest@localhost:5672';

  var exchanges = null;
  before(function() {
    exchanges = new base.Exchanges({
      title:              "Title for my Events",
      description:        "Test exchanges used for testing things only"
    });
    // Check that we can declare an exchange
    exchanges.declare({
      exchange:           'test-exchange',
      name:               'testExchange',
      title:              "Test Exchange",
      description:        "Place we post message for **testing**.",
      routingKey: [
        {
          name:           'testId',
          summary:        "Identifier that we use for testing",
          multipleWords:  false,
          required:       true,
          maxSize:        22
        }, {
          name:           'taskRoutingKey',
          summary:        "Test specific routing-key: `test.key`",
          multipleWords:  true,
          required:       true,
          maxSize:        128
        }, {
          name:           'state',
          summary:        "State of something",
          multipleWords:  false,
          required:       false,
          maxSize:        16
        }, {
          name:           'index',
          summary:        "index of something",
          multipleWords:  false,
          required:       false,
          maxSize:        3
        }
      ],
      schema:             'http://localhost:1203/exchange-test-schema.json#',
      messageBuilder:     function(msg) { return msg; },
      routingKeyBuilder:  function(msg, rk) { return rk; }
    });
    // Create validator to validate schema
    var validator = new base.validator.Validator();
    // Load exchange-test-schema.json schema from disk
    var schemaPath = path.join(__dirname, 'schemas', 'exchange-test-schema.json');
    var schema = fs.readFileSync(schemaPath, {encoding: 'utf-8'});
    validator.register(JSON.parse(schema));

    // Set validator on exchanges
    exchanges.configure({
      validator:              validator,
      connectionString:       connectionString
    });
  });

  // Test that we can connect to AMQP server
  test("connect", function() {
    return exchanges.connect().then(function(publisher) {
      assert(publisher instanceof base.Exchanges.Publisher,
             "Should get an instance of base.Exchanges.Publisher");
    });
  });

  // Test that we can publish messages
  test("publish message", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({someString: "My message"}, {
        testId:           "myid",
        taskRoutingKey:   "some.string.with.dots",
        state:            undefined // Optional
      });
    });
  });

  // Test that we can publish messages
  test("publish message w. number in routing key", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({someString: "My message"}, {
        testId:           "myid",
        taskRoutingKey:   "some.string.with.dots",
        state:            undefined, // Optional
        index:            15
      });
    });
  });

  // Test publication fails on schema violation
  test("publish error w. schema violation", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({
        someString:   "My message",
        "volation":   true
      }, {
        testId:           "myid",
        taskRoutingKey:   "some.string.with.dots",
        state:            undefined // Optional
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      // Expected an error
      debug("Got expected Error: %s, %j", err, err);
    });
  });


  // Test publication fails on required key missing
  test("publish error w. required key missing", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({
        someString:   "My message",
      }, {
        taskRoutingKey:   "some.string.with.dots",
        state:            "here"
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      // Expected an error
      debug("Got expected Error: %s, %j", err, err);
    });
  });

  // Test publication fails on size violation
  test("publish error w. size violation", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({
        someString:   "My message",
      }, {
        testId:           "myid-this-is-more-tahn-22-chars-long",
        taskRoutingKey:   "some.string.with.dots",
        state:            undefined // Optional
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      // Expected an error
      debug("Got expected Error: %s, %j", err, err);
    });
  });

  // Test publication fails on multiple words
  test("publish error w. multiple words", function() {
    return exchanges.connect().then(function(publisher) {
      return publisher.testExchange({
        someString:   "My message",
      }, {
        testId:           "not.single.word",
        taskRoutingKey:   "some.string.with.dots",
        state:            undefined // Optional
      });
    }).then(function() {
      assert(false, "Expected an error");
    }, function(err) {
      // Expected an error
      debug("Got expected Error: %s, %j", err, err);
    });
  });
});