var Exchanges = require('pulse-publisher');

var connectionString = 'amqp://guest:guest@localhost:5672';

var exchanges = new Exchanges({
  title:              'Test Exchanges',
  description:        'Used to generate a test reference',
});

exchanges.declare({
  exchange:           'test-exchange',
  name:               'testExchange',
  title:              '',
  description:        '',
  routingKey: [
    {
      name:           'const',
      summary:        'Constant test',
      constant:       'my-constant',
    }, {
      name:           'testId',
      summary:        '',
      multipleWords:  false,
      required:       true,
      maxSize:        22,
    }, {
      name:           'taskRoutingKey',
      summary:        '',
      multipleWords:  true,
      required:       true,
      maxSize:        128,
    }, {
      name:           'state',
      summary:        '',
      multipleWords:  false,
      required:       false,
      maxSize:        16,
    }, {
      name:           'index',
      summary:        '',
      multipleWords:  false,
      required:       false,
      maxSize:        3,
    },
  ],
  schema:             'http://localhost:1203/test-schema.json#',
  messageBuilder:     function(msg)         { return msg; },
  routingKeyBuilder:  function(msg, rk)     { return rk; },
  CCBuilder:          function(msg, rk, cc) { return cc || []; },
});

exchanges.declare({
  exchange:           'simple-test-exchange',
  name:               'simpleTestExchange',
  title:              '',
  description:        '',
  routingKey: [
    {
      name:           'testId',
      summary:        '',
      multipleWords:  false,
      required:       true,
      maxSize:        22,
    },
  ],
  schema:             'http://localhost:1203/test-schema.json#',
  messageBuilder:     function(msg)         { return msg; },
  routingKeyBuilder:  function(msg, rk)     { return rk; },
  CCBuilder:          function(msg, rk, cc) { return cc || []; },
});

exchanges.declare({
  exchange:           'really-simple-test-exchange',
  name:               'reallySimpleTestExchange',
  title:              '',
  description:        '',
  routingKey: [
  ],
  schema:             'http://localhost:1203/test-schema.json#',
  messageBuilder:     function(msg)         { return msg; },
  routingKeyBuilder:  function()            { return {}; },
  CCBuilder:          function(msg, rk, cc) { return cc || []; },
});

exchanges.configure({
  validator:              (x) => null,
  connectionString:       connectionString,
  exchangePrefix:         'taskcluster-client/test/',
});

// Configure exchanges for testing

// Export exchanges
module.exports = exchanges;

// Export connectionString for testing
exchanges.connectionString = connectionString;
