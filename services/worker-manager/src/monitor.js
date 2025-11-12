import { MonitorManager } from '@taskcluster/lib-monitor';

MonitorManager.register({
  name: 'workerPoolProvisioned',
  title: 'Worker Pool Provisioned',
  type: 'worker-pool-provisioned',
  version: 2,
  level: 'info',
  description: 'A worker pool\'s provisioning run has completed',
  fields: {
    workerPoolId: 'The worker pool ID',
    providerId: 'The provider that did the work for this worker pool.',
    duration: 'Time taken to provision the worker pool in ms',
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
    workerPoolId: 'The worker pool ID',
    providerId: 'The provider that did the work for this worker pool.',
    workerGroup: 'The worker group for this worker',
    workerId: 'The worker that was created',
    terminateAfter: 'Time after which worker should be terminated',
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
    workerPoolId: 'The worker pool ID',
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
    workerPoolId: 'The worker pool ID',
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
    workerPoolId: 'The worker pool ID',
    providerId: 'The provider that did the work for this worker pool.',
    workerId: 'The worker that is being removed',
    reason: 'The reason this worker is being removed',
  },
});

MonitorManager.register({
  name: 'simpleEstimate',
  title: 'Simple Estimate Provided',
  type: 'simple-estimate',
  version: 4,
  level: 'any',
  description: 'The simple estimator has decided that we need some number of instances.',
  fields: {
    workerPoolId: 'The worker pool name',
    pendingTasks: 'The number of tasks the queue reports are pending for this worker pool',
    minCapacity: 'The minimum amount of capacity that should be running',
    maxCapacity: 'The maximum amount of capacity that should be running',
    scalingRatio: 'The ratio of workers to spawn per pending task for this worker pool.',
    existingCapacity: 'Amount of currently requested and available capacity',
    desiredCapacity: 'Amount of capacity that this estimator thinks we should have',
    requestedCapacity: 'Amount of capacity that this estimator thinks we should add',
    stoppingCapacity: 'Amount of capacity being stopped',
  },
});

MonitorManager.register({
  name: 'scanSeen',
  title: 'Scan Seen',
  type: 'scan-seen',
  version: 3,
  level: 'notice',
  description: 'The results of a worker-scanner run',
  fields: {
    providerId: 'The provider that has completed this scan',
    seen: 'A map of workerPoolId that were seen to how much capacity was seen',
    total: 'Total number of workers seen',
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
  name: 'cloudApiMetrics',
  title: 'Cloud API call metrics',
  type: 'cloud-api-metrics',
  version: 1,
  level: 'notice',
  description: 'Metrics for cloud api calls',
  fields: {
    providerId: 'Metrics for the given provider',
    total: 'Total number of API calls made',
    success: 'Number of successful API calls',
    failed: 'Number of failed API calls',
    retries: 'Number of retried API calls',
    byStatus: 'Map of HTTP status codes to counts',
    min: 'Minimum API call duration in milliseconds',
    max: 'Maximum API call duration in milliseconds',
    avg: 'Average API call duration in milliseconds',
    median: 'Median API call duration in milliseconds',
    p95: '95th percentile API call duration in milliseconds',
    p99: '99th percentile API call duration in milliseconds',
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
    workerPoolId: 'The worker pool ID',
    providerId: 'The provider that did the work for this worker pool.',
    workerId: 'The worker that failed',
  },
});

MonitorManager.register({
  name: 'registrationNewIntermediateCertificate',
  title: 'Registration of New Intermediate Certificate',
  type: 'registration-new-intermediate-certificate',
  version: 1,
  level: 'warning',
  description: `
    A worker's identify proof message was signed by an unknown intermediate certificate.
    This was successfully downloaded, verified by root CAs, and added to the CA store.
  `,
  fields: {
    subject: 'The distinguished name of the certificate subject',
    issuer: 'The distinguished name of the certificate issuer',
    fingerprint: 'The fingerprint of the certificate',
    url: 'The URL from which the certificate was downloaded',
  },
});

MonitorManager.register({
  name: 'launchConfigSelectorsDebug',
  title: 'Launch Config Selector Debug Information',
  type: 'launch-config-selector-debug',
  version: 1,
  level: 'debug',
  description: `
    During worker pool provisioning, launch config selector may change config weight
    based on current state of the system and initial data.
    This event may help to understand how launch configs were used at selection time
    and what their adjusted weights were.
  `,
  fields: {
    workerPoolId: 'Worker Pool ID',
    weights: 'An object with launchConfigId as a key and adjusted weight as value',
    remainingCapacity: 'An object with launchConfigId as a key and remaining capacity',
  },
});

MonitorManager.register({
  name: 'azureResourceGroupEnsured',
  title: 'Azure Resource Group Create or Update Information',
  type: 'azure-resource-group-ensure',
  version: 1,
  level: 'notice',
  description: `
    When ARM template is being deployed with custom resource group name,
    Azure provider would create or update the resource group.
    This is to make sure that deployment is run in the existing resource group.
  `,
  fields: {
    workerPoolId: 'Worker Pool ID',
    resourceGroupName: 'Resource Group Name',
    location: 'Location',
  },
});

const commonLabels = {
  workerPoolId: 'The worker pool ID',
};

MonitorManager.registerMetric('existingCapacity', {
  name: 'worker_manager_existing_capacity',
  type: 'gauge',
  title: 'Existing capacity',
  description: `
    This number represents the running capacity of running and not quarantined workers.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('stoppingCapacity', {
  name: 'worker_manager_stopping_capacity',
  type: 'gauge',
  title: 'Stopping capacity',
  description: `
    This number represents the running capacity of workers that are stopping.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('requestedCapacity', {
  name: 'worker_manager_requested_capacity',
  type: 'gauge',
  title: 'Requested capacity',
  description: `
    This number represents the running capacity of workers that are requested.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('desiredCapacity', {
  name: 'worker_manager_desired_capacity',
  type: 'gauge',
  title: 'Desired capacity',
  description: `
    This number represents calculation of the estimator for a given worker pool,
    with regards to min and max capacity of the worker pool, number of adjusted
    pending tasks and scaling ratio. Refer to estimator.js for exact logic.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('totalIdleCapacity', {
  name: 'worker_manager_total_idle_capacity',
  type: 'gauge',
  title: 'Total idle capacity',
  description: `
    This number represents difference in existing capacity
    (running capacity of running and not quarantined workers), and the number of
    claimed tasks.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('adjustedPendingTasks', {
  name: 'worker_manager_adjusted_pending_tasks',
  type: 'gauge',
  title: 'Adjusted pending tasks',
  description: `
    This number represents difference in pending tasks and idle capacity.
    Adjustment is needed to make sure workers that are still running and are currently
    not doing any work, will soon pick up those tasks, so we don't need additional workers for those.
    Assumption is that those idling workers would pick up tasks soon.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('pendingTasks', {
  name: 'worker_manager_pending_tasks',
  type: 'gauge',
  title: 'Pending tasks',
  description: `
    This number represents the number of pending tasks.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('claimedTasks', {
  name: 'worker_manager_claimed_tasks',
  type: 'gauge',
  title: 'Claimed tasks',
  description: `
    This number represents the number of claimed tasks.
  `,
  labels: commonLabels,
  registers: ['provision'],
});

MonitorManager.registerMetric('provisionDuration', {
  name: 'worker_manager_worker_pool_provision_seconds',
  type: 'histogram',
  title: 'Worker pool provision duration',
  description: 'Time it took to provision a single worker pool',
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['provision'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

MonitorManager.registerMetric('workerRegistrationDuration', {
  name: 'worker_manager_worker_registration_seconds',
  type: 'histogram',
  title: 'Worker registration duration',
  description: `
    Time for a worker to go from being requested to successfully registering
    with worker-manager
  `,
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['workers'],
  buckets: [15, 30, 45, 60, 90, 120, 180, 300, 600, 1200, 1800],
});

MonitorManager.registerMetric('workerLifetime', {
  name: 'worker_manager_worker_lifetime_seconds',
  type: 'histogram',
  title: 'Worker lifetime',
  description: `
    Time for a worker to go from running to either being removed or fully
    stopped
  `,
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['workers'],
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400, 172800, 604800, 1209600],
});

MonitorManager.registerMetric('workerRegistrationFailure', {
  name: 'worker_manager_worker_registration_failures_total',
  type: 'counter',
  title: 'Workers that never registered',
  description: `
    Counts workers that were requested but never registered before being
    removed or stopped.
  `,
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['workers'],
});

MonitorManager.registerMetric('scanSeen', {
  name: 'worker_manager_worker_pool_scan_seen_workers',
  type: 'gauge',
  title: 'Worker pool workers checked during scan',
  description: 'Total number of workers checked for given workerPoolId during scanning.',
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['scan'],
});

MonitorManager.registerMetric('scanErrors', {
  name: 'worker_manager_worker_pool_scan_errors',
  type: 'gauge',
  title: 'Worker pool errors during scan',
  description: 'Total number of errors for worker pool during scanning',
  labels: {
    ...commonLabels,
    providerId: 'ID of the provider',
  },
  registers: ['scan'],
});
