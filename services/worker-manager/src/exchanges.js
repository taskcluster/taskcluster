const { Exchanges } = require('taskcluster-lib-pulse');

const exchanges = new Exchanges({
  title: 'Worker Manager Exchanges',
  projectName: 'taskcluster-worker-manager',
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  description: [
    'These exchanges provide notifications when a worker pool is created or updated.',
    '',
    'This is so that the provisioner running in a different',
    'process at the other end can synchronize to the changes. But you are of',
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
  exchange: 'worker-pool-created',
  name: 'workerPoolCreated',
  title: 'Worker Pool Created Messages',
  description: [
    'Whenever the api receives a request to create a',
    'worker pool, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join(''),
  schema: 'pulse-worker-pool-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'worker-pool-updated',
  name: 'workerPoolUpdated',
  title: 'Worker Pool Updated Messages',
  description: [
    'Whenever the api receives a request to update a',
    'worker pool, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join(''),
  schema: 'pulse-worker-pool-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});
