"use strict";

suite('testing.PulseTestReceiver', function() {
  var base          = require('../../');
  var assert        = require('assert');
  var path          = require('path');
  var fs            = require('fs');
  var slugid        = require('slugid');
  var taskcluster   = require('taskcluster-client')

  // Load necessary configuration
  var cfg = base.config({
    filename:               'taskcluster-base-test'
  });

  // Validate that we have needed config
  if (!cfg.get('influxdb:connectionString')) {
    throw new Error("Skipping 'testing.Events' test, missing config file: " +
                    "taskcluster-base-test.conf.json");
    return;
  }

  // Setup an exchange so we publish messages
  var exchanges = new base.Exchanges({
    title:        "My Title",
    description:  "My description"
  });

  // Declare an exchange to play with
  exchanges.declare({
    exchange:           'test-exchange',
    name:               'testExchange',
    title:              "Test Exchange",
    description:        "Place we post message for **testing**.",
    routingKey: [
      {
        name:           'someId',
        summary:        "Identifier that we use for testing",
        multipleWords:  true,
        required:       true,
        maxSize:        22
      }
    ],
    schema:             'http://localhost:1203/exchange-test-schema.json#',
    messageBuilder:     function(msg)         { return msg;               },
    routingKeyBuilder:  function(msg, someId) { return {someId: someId};  },
    CCBuilder:          function()            { return [];                }
  });

  // Create validator to validate schema, and load exchange-test-schema.json
  // from disk
  var validator = new base.validator.Validator();
  var schemaPath = path.join(__dirname, '..', 'schemas',
                             'exchange-test-schema.json');
  var schema = fs.readFileSync(schemaPath, {encoding: 'utf-8'});
  validator.register(JSON.parse(schema));

  // Set options on exchanges
  exchanges.configure({
    validator:              validator,
    credentials:            cfg.get('pulse')
  });

  // Create exchangeEvents client using taskcluster-client and the reference
  // generate by exchanges
  var ExchangeEvents = taskcluster.createClient(exchanges.reference());
  var exchangeEvents = new ExchangeEvents();

  // Now let's create a single event listener for messages, or whatever we
  // should call this utility.
  var receiver = new base.testing.PulseTestReceiver(cfg.get('pulse'));

  test("Can publish message", function() {
    // Create someId
    var mySomeId = slugid.v4();

    // Start listening for message from testExchange with someId
    return receiver.listenFor('my-message', exchangeEvents.testExchange({
      someId:     mySomeId
    })).then(function() {
      // Now that we're listening for a message from testExchange with mySomeId
      // let's connect the exchange and send a message
      return exchanges.connect();
    }).then(function(publisher) {
      // Now the exchange is connected and we have a publisher, this is
      // where we send a message with mySomeId as routing key
      return publisher.testExchange({
        someString:   "Hello World"
      }, mySomeId);
    }).then(function() {
      // Now that the message has been sent, we waitFor it
      return receiver.waitFor('my-message');
    }).then(function(message) {
      assert(message.payload.someString === "Hello World",
             "The world expected a greeting!");
    });
  });

});
