let Exchanges = require('pulse-publisher');
let assert    = require('assert');

/** Declaration of exchanges offered by the queue */
let exchanges = new Exchanges({
  title:      'Notify AMQP Exchanges',
  description: [
    'Write something here!',
  ].join('\n'),
  schemaPrefix:         'http://schemas.taskcluster.net/notify/v1/',
});

// Export exchanges
module.exports = exchanges;

/** Build common routing key construct for `exchanges.declare` */
let buildCommonRoutingKey = function(options) {
  options = options || {};
  return [
    {
      name:             'routingKeyKind',
      summary:          'Identifier for the routing-key kind. This is ' +
                        'always `\'primary\'` for the formalized routing key.',
      constant:         'primary',
      required:         true,
    }, {
      name:             'reserved',
      summary:          'Space reserved for future routing-key entries, you ' +
                        'should always match this entry with `#`. As ' +
                        'automatically done by our tooling, if not specified.',
      multipleWords:    true,
      maxSize:          1,
    },
  ];
};

/** Build an AMQP compatible message from a message */
let commonMessageBuilder = function(message) {
  message.version = 1;
  return message;
};

/** Build a message from message */
let commonRoutingKeyBuilder = function(message, routing) {
  return {};
};

/** Build list of routing keys to CC */
let commonCCBuilder = function(message, routes) {
  assert(routes instanceof Array, 'Routes must be an array');
  return routes.map(route => 'route.' + route);
};

/** Notification exchange */
exchanges.declare({
  exchange:           'notification',
  name:               'notify',
  title:              'Notification Messages',
  description: [
    'An arbitrary message that a taskcluster user',
    'can trigger if they like.',
  ].join('\n'),
  routingKey:         buildCommonRoutingKey(),
  schema:             'notification-message.json#',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder,
  CCBuilder:          commonCCBuilder,
});
