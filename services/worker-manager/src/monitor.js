const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'worker-manager',
});

monitorManager.register({
  name: 'workerPoolProvisioned',
  title: 'Worker Pool Provisioned',
  type: 'worker-pool-provisioned',
  version: 1,
  level: 'info',
  description: 'A worker pool\'s provisioning run has completed',
  fields: {
    workerPoolId: 'The worker pool ID (provisionerId/workerType)',
    providerId: 'The provider that did the work for this worker pool.',
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
    workerPoolId: 'The worker pool name (provisionerId/workerType)',
    pendingTasks: 'The number of tasks the queue reports are pending for this worker pool',
    minCapacity: 'The minimum amount of capacity that should be running',
    maxCapacity: 'The maximum amount of capacity that should be running',
    capacityPerInstance: 'Amount of capacity a single instance provides',
    running: 'Number of currently requested and running instances',
    desiredSize: 'Number that this estimator thinks we should have',
  },
});

module.exports = monitorManager;
