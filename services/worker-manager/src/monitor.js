const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'worker-manager',
});

monitorManager.register({
  name: 'workertypeProvisioned',
  title: 'Workertype Provisioned',
  type: 'workertype-provisioned',
  version: 1,
  level: 'info',
  description: 'A workerType\'s provisioning run has completed',
  fields: {
    workerTypeName: 'The worker type name (provisionerId/workerType)',
    provider: 'The name of the provider that did the work for this workertype.',
  },
});

monitorManager.register({
  name: 'simpleEstimate',
  title: 'Simple Estimate Provided',
  type: 'simple-estimate',
  version: 1,
  level: 'notice',
  description: 'The simple estimator has decided that we need some number of instances.',
  fields: {
    workerTypeName: 'The worker type name (provisionerId/workerType)',
    pendingTasks: 'The number of tasks the queue reports are pending for this workerType',
    minCapacity: 'The minimum amount of capacity that should be running',
    maxCapacity: 'The maximum amount of capacity that should be running',
    capacityPerInstance: 'Amount of capacity a single instance provides',
    running: 'Number of currently requested and running instances',
    desiredSize: 'Number that this estimator thinks we should have',
  },
});

module.exports = monitorManager;
