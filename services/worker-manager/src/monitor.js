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

monitorManager.register({
  name: 'workerError',
  type: 'worker-error',
  title: 'Worker Error',
  level: 'warning',
  version: 1,
  description: `
    An error was reported regarding the given worker pool.  Such errors are generally
    the responsibility of the owner of the worker pool, but may also indicate issues
    with the Taskcluster deployment and as such are reported in the service logs as
    well.  Note that the 'extra' data associated with such a report is not included
    here.  To see that, use the UI or API to view the worker pool errors directly.`,
  fields: {
    workerPoolId: 'The workerPool where the error occurred',
    errorId: 'The unique id of this error report',
    kind: 'The error kind',
    title: 'The error title',
    description: 'Description of the error',
  },
});

module.exports = monitorManager;
