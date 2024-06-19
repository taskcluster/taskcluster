import { Exchanges } from 'taskcluster-lib-pulse';
import assert from 'assert';

/** Declaration of exchanges offered by the queue */
const exchanges = new Exchanges({
  title: 'Notify AMQP Exchanges',
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
export default exchanges;

/** Build common routing key construct for `exchanges.declare` */
const buildCommonRoutingKey = function(options) {
  options = options || {};
  return [
    {
      name: 'routingKeyKind',
      summary: 'Identifier for the routing-key kind. This is ' +
                        'always `\'primary\'` for the formalized routing key.',
      constant: 'primary',
      required: true,
    }, {
      name: 'topic',
      summary: 'Custom topic. This is the <topic> portion of the ' +
                        '`notify.pulse.<topic>.on-<event>` routes.',
      maxSize: 100,
      multipleWords: true,
      required: true,
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
  return {
    topic: routing[0],
  };
};

/** Build list of routing keys to CC */
const commonCCBuilder = function(message, routes) {
  assert(routes instanceof Array, 'Routes must be an array');
  return routes.map(route => 'route.' + route);
};

/** Notification exchange */
exchanges.declare({
  exchange: 'notification',
  name: 'notify',
  title: 'Notification Messages',
  description: [
    'An arbitrary message that a taskcluster user',
    'can trigger if they like.',
    '',
    'The standard one that is published by us watching',
    'for the completion of tasks is just the task status',
    'data that we pull from the queue `status()` endpoint',
    'when we notice a task is complete.',
  ].join('\n'),
  routingKey: buildCommonRoutingKey(),
  schema: 'notification-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: commonCCBuilder,
});
