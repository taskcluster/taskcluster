const {Exchanges} = require('taskcluster-lib-pulse');
const assert = require('assert');

/** Declaration of exchanges offered by the queue */
const exchanges = new Exchanges({
  title:      'Notify AMQP Exchanges',
  description: [
    'This pretty much only contains the simple free-form',
    'message that can be published from this service from a request',
    'by anybody with the proper scopes.',
  ].join('\n'),
  serviceName: 'notify',
  projectName: 'taskcluster-notify',
  apiVersion: 'v1',
});

// Export exchanges
module.exports = exchanges;

/** Build common routing key construct for `exchanges.declare` */
const buildCommonRoutingKey = function(options) {
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
const commonMessageBuilder = function(message) {
  message.version = 1;
  return message;
};

/** Build a message from message */
const commonRoutingKeyBuilder = function(message, routing) {
  return {};
};

/** Build list of routing keys to CC */
const commonCCBuilder = function(message, routes) {
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
    '',
    'The standard one that is published by us watching',
    'for the completion of tasks is just the task status',
    'data that we pull from the queue `status()` endpoint',
    'when we notice a task is complete.',
  ].join('\n'),
  routingKey:         buildCommonRoutingKey(),
  schema:             'notification-message.yml',
  messageBuilder:     commonMessageBuilder,
  routingKeyBuilder:  commonRoutingKeyBuilder,
  CCBuilder:          commonCCBuilder,
});
