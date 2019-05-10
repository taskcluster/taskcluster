const {Exchanges} = require('taskcluster-lib-pulse');

const exchanges = new Exchanges({
  title: 'Worker Manager Exchanges',
  projectName: 'taskcluster-worker-manager',
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  description: [
    'These exchanges provide notifications when a workerType is created, updated',
    'or deleted. This is so that the listener running in a different',
    'process at the other end can direct another listener specified by',
    '`provider` and `workerType` to synchronize its bindings. But you are of',
    'course welcome to use these for other purposes, monitoring changes for example.',
  ].join(''),
});

module.exports = exchanges;

let buildCommonRoutingKey = (options) => {
  return [
    {
      name: 'routingKeyKind',
      summary: 'Identifier for the routing-key kind. This is ' +
                        'always `\'primary\'` for the formalized routing key.',
      constant: 'primary',
      required: true,
    }, {
      name: 'reserved',
      summary: 'Space reserved for future routing-key entries, you ' +
                        'should always match this entry with `#`. As ' +
                        'automatically done by our tooling, if not specified.',
      multipleWords: true,
      maxSize: 1,
    },
  ];
};

let commonMessageBuilder = function(message) {
  return message;
};

exchanges.declare({
  exchange: 'workertype-created',
  name: 'workerTypeCreated',
  title: 'WorkerType Created Messages',
  description: [
    'Whenever the api receives a request to create a',
    'workerType, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join(''),
  schema: 'pulse-workertype-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});

// Hook updated exchange
exchanges.declare({
  exchange: 'workertype-updated',
  name: 'workerTypeUpdated',
  title: 'WorkerType Updated Messages',
  description: [
    'Whenever the api receives a request to update a',
    'workerType, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join(''),
  schema: 'pulse-workertype-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});

// Hook deleted exchange
exchanges.declare({
  exchange: 'workertype-deleted',
  name: 'workerTypeDeleted',
  title: 'WorkerType Deleted Messages',
  description: [
    'Whenever the api receives a request to delete a',
    'workerType, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join(''),
  schema: 'pulse-workertype-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});
