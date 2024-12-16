import { Exchanges } from 'taskcluster-lib-pulse';
import { splitWorkerPoolId } from './util.js';

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

export default exchanges;

let buildCommonRoutingKey = (options) => {
  return [
    {
      name: 'routingKeyKind',
      summary: 'Identifier for the routing-key kind. This is ' +
                        'always `\'primary\'` for the formalized routing key.',
      constant: 'primary',
      required: true,
    }, {
      name: 'providerId',
      summary: 'Provider.',
      required: options?.hasWorker || false,
      maxSize: 38,
    }, {
      name: 'provisionerId',
      summary: 'First part of the workerPoolId.',
      required: options?.hasWorker || false,
      maxSize: 38,
    }, {
      name: 'workerType',
      summary: 'Second part of the workerPoolId.',
      required: options?.hasWorker || false,
      maxSize: 38,
    }, {
      name: 'workerGroup',
      summary: 'Worker group of the worker (region or location)',
      required: options?.hasWorker || false,
      maxSize: 38,
    }, {
      name: 'workerId',
      summary: 'Worker ID',
      required: options?.hasWorker || false,
      maxSize: 38,
    }, {
      name: 'launchConfigId',
      summary: 'ID of the launch configuration',
      required: false,
      maxSize: 38,
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

let commonRoutingKeyBuilder = function(message, routing) {
  const mapping = {
    workerGroup: message.workerGroup,
    providerId: message.providerId,
    workerId: message.workerId,
    launchConfigId: message.launchConfigId,
  };

  if (message.provisionerId && message.workerType) {
    mapping.provisionerId = message.provisionerId;
    mapping.workerType = message.workerType;
  } else if (message.workerPoolId) {
    const { provisionerId, workerType } = splitWorkerPoolId(message.workerPoolId);
    mapping.provisionerId = provisionerId;
    mapping.workerType = workerType;
  }

  return mapping;
};

exchanges.declare({
  exchange: 'worker-pool-created',
  name: 'workerPoolCreated',
  title: 'Worker Pool Created Messages',
  description: [
    'Whenever the api receives a request to create a',
    'worker pool, a message is posted to this exchange and',
    'a provider can act upon it.',
  ].join('\n'),
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
  ].join('\n'),
  schema: 'pulse-worker-pool-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: () => '',
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'worker-pool-error',
  name: 'workerPoolError',
  title: 'Worker Pool Provisioning Error Messages',
  description: [
    'Whenever a worker reports an error',
    'or provisioner encounters an error while',
    'provisioning a worker pool, a message is posted to this',
    'exchange.',
  ].join('\n'),
  schema: 'pulse-worker-pool-error-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

// worker related events
exchanges.declare({
  exchange: 'worker-requested',
  name: 'workerRequested',
  title: 'Worker Requested Messages',
  description: [
    'Whenever a worker is requested, a message is posted',
    'to this exchange.',
  ].join('\n'),
  schema: 'pulse-worker-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey({ hasWorker: true }),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'worker-running',
  name: 'workerRunning',
  title: 'Worker Running Messages',
  description: [
    'Whenever a worker has registered, a message is posted',
    'to this exchange. This means that worker started',
    'successfully and is ready to claim work.',
  ].join('\n'),
  schema: 'pulse-worker-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey({ hasWorker: true }),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'worker-stopped',
  name: 'workerStopped',
  title: 'Worker Stopped Messages',
  description: [
    'Whenever a worker has stopped, a message is posted',
    'to this exchange. This means that instance was',
    'either terminated or stopped gracefully.',
  ].join('\n'),
  schema: 'pulse-worker-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey({ hasWorker: true }),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'worker-removed',
  name: 'workerRemoved',
  title: 'Worker Removed Messages',
  description: [
    'Whenever a worker is removed, a message is posted to this exchange.',
    'This occurs when a worker is requested to be removed via an API call',
    'or when a worker is terminated by the worker manager.',
    'The reason for the removal is included in the message.',
  ].join('\n'),
  schema: 'pulse-worker-removed-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey({ hasWorker: true }),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'launch-config-created',
  name: 'launchConfigCreated',
  title: 'Launch Config Created Messages',
  description: [
    'Whenever a new launch configuration is created for a worker pool,',
    'a message is posted to this exchange.',
  ].join('\n'),
  schema: 'pulse-launch-config-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'launch-config-updated',
  name: 'launchConfigUpdated',
  title: 'Launch Config Updated Messages',
  description: [
    'Whenever a launch configuration is updated for a worker pool,',
    'a message is posted to this exchange.',
  ].join('\n'),
  schema: 'pulse-launch-config-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});

exchanges.declare({
  exchange: 'launch-config-archived',
  name: 'launchConfigArchived',
  title: 'Launch Config Archived Messages',
  description: [
    'Whenever a launch configuration is archived for a worker pool,',
    'a message is posted to this exchange.',
  ].join('\n'),
  schema: 'pulse-launch-config-message.yml',
  messageBuilder: commonMessageBuilder,
  routingKey: buildCommonRoutingKey(),
  routingKeyBuilder: commonRoutingKeyBuilder,
  CCBuilder: () => [],
});
