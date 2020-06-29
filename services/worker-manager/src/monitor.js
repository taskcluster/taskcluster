const {MonitorManager} = require('taskcluster-lib-monitor');

MonitorManager.register({
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

MonitorManager.register({
  name: 'workerRequested',
  title: 'Worker Requested',
  type: 'worker-requested',
  version: 1,
  level: 'notice',
  description: 'A worker has been requested from a cloud api',
  fields: {
    workerPoolId: 'The worker pool ID (provisionerId/workerType)',
    providerId: 'The provider that did the work for this worker pool.',
    workerGroup: 'The worker group for this worker',
    workerId: 'The worker that was created',
  },
});

MonitorManager.register({
  name: 'workerRunning',
  title: 'Worker Running',
  type: 'worker-running',
  version: 1,
  level: 'notice',
  description: 'A worker has been marked as running',
  fields: {
    workerPoolId: 'The worker pool ID (provisionerId/workerType)',
    providerId: 'The provider that did the work for this worker pool.',
    workerId: 'The worker that is running',
  },
});

MonitorManager.register({
  name: 'workerStopped',
  title: 'Worker Stopped',
  type: 'worker-stopped',
  version: 1,
  level: 'notice',
  description: 'A worker has been marked as stopped',
  fields: {
    workerPoolId: 'The worker pool ID (provisionerId/workerType)',
    providerId: 'The provider that did the work for this worker pool.',
    workerId: 'The worker that was stopped',
  },
});

MonitorManager.register({
  name: 'workerRemoved',
  title: 'Worker Removed',
  type: 'worker-removed',
  version: 1,
  level: 'notice',
  description: `
    A request has been made to stop a worker.  This operation can sometimes
    take some time.
  `,
  fields: {
    workerPoolId: 'The worker pool ID (provisionerId/workerType)',
    providerId: 'The provider that did the work for this worker pool.',
    workerId: 'The worker that is being removed',
    reason: 'The reason this worker is being removed',
  },
});

MonitorManager.register({
  name: 'simpleEstimate',
  title: 'Simple Estimate Provided',
  type: 'simple-estimate',
  version: 3,
  level: 'any',
  description: 'The simple estimator has decided that we need some number of instances.',
  fields: {
    workerPoolId: 'The worker pool name (provisionerId/workerType)',
    pendingTasks: 'The number of tasks the queue reports are pending for this worker pool',
    minCapacity: 'The minimum amount of capacity that should be running',
    maxCapacity: 'The maximum amount of capacity that should be running',
    existingCapacity: 'Amount of currently requested and available capacity',
    desiredCapacity: 'Amount of capacity that this estimator thinks we should have',
    requestedCapacity: 'Amount of capacity that this estimator thinks we should add',
  },
});

MonitorManager.register({
  name: 'scanSeen',
  title: 'Scan Seen',
  type: 'scan-seen',
  version: 2,
  level: 'notice',
  description: 'The results of a worker-scanner run',
  fields: {
    providerId: 'The provider that has completed this scan',
    seen: 'A map of workerPoolId that were seen to how much capacity was seen',
  },
});

MonitorManager.register({
  name: 'workerError',
  type: 'worker-error',
  title: 'Worker Error',
  level: 'notice',
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

MonitorManager.register({
  name: 'cloudApiPaused',
  title: 'Cloud API Paused',
  type: 'cloud-api-paused',
  version: 1,
  level: 'any',
  description: 'Rate limiting engaged for a cloud api',
  fields: {
    providerId: 'Which provider has hit a limit',
    queueName: 'Which queue is paused -- there is one for each class of api request',
    reason: 'Either `errors` or `rateLimit`.',
    queueSize: 'Number of requests remaining in the queue when it is paused.',
    duration: 'Length of time the queue is paused for in ms.',
  },
});

MonitorManager.register({
  name: 'cloudApiResumed',
  title: 'Cloud API Resumed',
  type: 'cloud-api-resumed',
  version: 1,
  level: 'notice',
  description: 'A provider has resumed api requests.',
  fields: {
    providerId: 'Which provider has hit a limit (each provider manages a single project)',
    queueName: 'Which queue is paused -- there is one for each class of api request',
  },
});

MonitorManager.register({
  name: 'registrationErrorWarning',
  title: 'Registration Error Warning',
  type: 'registration-error-warning',
  version: 1,
  level: 'warning',
  description: `
    Something has tried to register as a worker but failed. This could indicate either a bug
    or that somebody is trying to impersonate a worker.
  `,
  fields: {
    message: 'Description of this error from the taskcluster side',
    error: 'Error message from cloud that triggered this',
  },
});
