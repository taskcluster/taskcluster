var base = require('taskcluster-base');

var connectionString = 'amqp://guest:guest@localhost:5672';

exchanges = new base.Exchanges({
  title:              "Test Exchanges",
  description:        "Used to generate a test reference"
});

exchanges.declare({
  exchange:           'test-exchange',
  name:               'testExchange',
  title:              "",
  description:        "",
  routingKey: [
    {
      name:           'const',
      summary:        "Constant test",
      constant:       "my-constant"
    }, {
      name:           'testId',
      summary:        "",
      multipleWords:  false,
      required:       true,
      maxSize:        22
    }, {
      name:           'taskRoutingKey',
      summary:        "",
      multipleWords:  true,
      required:       true,
      maxSize:        128
    }, {
      name:           'state',
      summary:        "",
      multipleWords:  false,
      required:       false,
      maxSize:        16
    }, {
      name:           'index',
      summary:        "",
      multipleWords:  false,
      required:       false,
      maxSize:        3
    }
  ],
  schema:             'http://localhost:1203/test-schema.json#',
  messageBuilder:     function(msg)         { return msg; },
  routingKeyBuilder:  function(msg, rk)     { return rk; },
  CCBuilder:          function(msg, rk, cc) { return cc || []; }
});

// Create validator to validate schema
var validator = new base.validator.Validator();
validator.register({
  "id":           "http://localhost:1203/test-schema.json#",
  "$schema":      "http://json-schema.org/draft-04/schema#",
  "type":         "object"
});

// Configure exchanges for testing
exchanges.configure({
  validator:              validator,
  connectionString:       connectionString,
  exchangePrefix:         'taskcluster-client/test/',
  drain:                  new base.stats.NullDrain(),
  component:              'taskcluster-client',
  process:                'mocha'
});

// Export exchanges
module.exports = exchanges;

// Export connectionString for testing
exchanges.connectionString = connectionString;
