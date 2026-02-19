import { MonitorManager } from '@taskcluster/lib-monitor';

/**
 * For ease of debugging, all log messages about tasks have a top-level
 * `taskId` field.  In cases where multiple tasks are handled together, prefer
 * to make individual log entries for each task.
 */

MonitorManager.register({
  name: 'queuePoll',
  title: 'Queue Poll',
  type: 'queue-poll',
  version: 1,
  level: 'info',
  description: 'Report result of polling tasks from queue tables.',
  fields: {
    count: 'Number of tasks fetched.',
    failed: 'Number of these tasks that failed to be handled.',
    resolver: 'The name of the queue being polled.',
  },
});

MonitorManager.register({
  name: 'taskDefined',
  title: 'Task Defined',
  type: 'task-defined',
  version: 1,
  level: 'notice',
  description: `
    A task has been created (createTask).  This is logged when the task-defined
    pulse message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
  },
});

MonitorManager.register({
  name: 'taskPending',
  title: 'Task Pending',
  type: 'task-pending',
  version: 1,
  level: 'notice',
  description: `
    A task is now pending and ready to be executed.  This is logged when the task-pending pulse
    message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
    runId: 'The runId that is now pending.',
  },
});

MonitorManager.register({
  name: 'taskRunning',
  title: 'Task Running',
  type: 'task-running',
  version: 1,
  level: 'notice',
  description: `
    A task is now being executed.  This is logged when the task-running pulse message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
    runId: 'The runId that is now running.',
  },
});

MonitorManager.register({
  name: 'taskCompleted',
  title: 'Task Completed',
  type: 'task-completed',
  version: 1,
  level: 'notice',
  description: `
    A task run has been resolved as completed.  This is logged when the task-completed pulse
    message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
    runId: 'The runId that was resolved.',
  },
});

MonitorManager.register({
  name: 'taskFailed',
  title: 'Task Failed',
  type: 'task-failed',
  version: 1,
  level: 'notice',
  description: `
    A task run has been resolved as failed.  This is logged when the task-failed pulse
    message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
    runId: 'The runId that was resolved.',
  },
});

MonitorManager.register({
  name: 'taskGroupCancelled',
  title: 'Task Group Cancelled',
  type: 'task-group-cancelled',
  version: 1,
  level: 'notice',
  description: `
    All non-resolved tasks within given task group have been cancelled.`,
  fields: {
    taskGroupId: 'The task group id.',
    taskGroupSize: 'Total count of tasks in group',
    cancelledCount: 'Total count of tasks whose state was changed',
  },
});

MonitorManager.register({
  name: 'taskException',
  title: 'Task Exception',
  type: 'task-exception',
  version: 1,
  level: 'notice',
  description: `
    A task run has been resolved as an exception.  This is logged when the task-exception pulse
    message is sent.`,
  fields: {
    taskId: 'The task\'s taskId.',
    runId: 'The runId that was resolved.',
  },
});

MonitorManager.register({
  name: 'taskClaimed',
  title: 'Task Claimed',
  type: 'task-claimed',
  version: 1,
  level: 'notice',
  description: `
    A worker has claimed a task.  In cases where multple tasks were claimed,
    one log message will be produced for each task.`,
  fields: {
    taskQueueId: "The task queue ID for which work is being claimed",
    workerGroup: 'Group of worker claiming work.',
    workerId: 'The id of the claiming worker.',
    taskId: 'The task given to the worker.',
    runId: 'The run of this task assigned to the worker.',
  },
});

MonitorManager.register({
  name: 'taskReclaimed',
  title: 'Task Reclaimed',
  type: 'task-reclaimed',
  version: 1,
  level: 'notice',
  description: `
    A worker has reclaimed a task it had previously claimed, extending its takenUntil
    timestamp.`,
  fields: {
    workerGroup: 'Group of the reclaiming worker.',
    workerId: 'Id of the reclaiming worker.',
    taskId: 'The task being reclaimed.',
    runId: 'The run of this task being reclaimed.',
  },
});

MonitorManager.register({
  name: 'taskGroupSealed',
  title: 'Task Group Sealed',
  type: 'task-group-sealed',
  version: 1,
  level: 'notice',
  description: `
    Task group was sealed and will no longer allow creation of tasks.`,
  fields: {
    taskGroupId: 'Task group ID',
    schedulerId: 'Id of the reclaiming worker.',
    expires: 'Date and time of task group expiration',
    sealed: 'Date and time when task group was sealed',
  },
});

MonitorManager.register({
  name: 'taskPriorityChanged',
  title: 'Task Priority Changed',
  type: 'task-priority-changed',
  version: 1,
  level: 'notice',
  description: `
    A task priority value was updated via APIs.`,
  fields: {
    taskId: 'The task being reprioritized.',
    oldPriority: 'Previous priority value.',
    newPriority: 'New priority value.',
  },
});

MonitorManager.register({
  name: 'taskGroupPriorityChanged',
  title: 'Task Group Priority Changed',
  type: 'task-group-priority-changed',
  version: 1,
  level: 'notice',
  description: `
    A task group reprioritization completed.`,
  fields: {
    taskGroupId: 'Task group that was reprioritized.',
    schedulerId: 'Scheduler of the task group.',
    tasksAffected: 'Total number of tasks updated during the request.',
    newPriority: 'Priority value applied to each task.',
  },
});

MonitorManager.register({
  name: 'hintPoller',
  title: 'Hint Poller Report',
  type: 'hint-poller',
  version: 1,
  level: 'info',
  description: 'Metrics of an iteration of the hint poller.',
  fields: {
    claimed: 'Number of hints claimed on an iteration.',
    released: 'Number of hints released on an iteration. Should usually be 0.',
    slept: 'If true, there were no hints to claim and the poller slept before claiming again.',
  },
});

MonitorManager.register({
  name: 'expiredArtifactsRemoved',
  title: 'Expired Artifacts Removed',
  type: 'expired-artifacts-removed',
  version: 2,
  level: 'notice',
  description: `Reports progress of expired artifacts removal.`,
  fields: {
    count: 'Count of artifacts removed.',
    expires: 'Expiration date of artifacts removed.',
    errorsCount: 'Count of errors encountered (most likely missing objects)',
  },
});

const commonLabels = {
  provisionerId: 'ProvisionerID part of the taskQueueId',
  workerType: 'WorkerType part of the taskQueueId',
};

MonitorManager.registerMetric('completedTasks', {
  name: 'queue_completed_tasks',
  type: 'counter',
  title: 'Counter for completed tasks',
  description: 'Counter for completed tasks',
  labels: commonLabels,
  registers: ['default'],
});

MonitorManager.registerMetric('failedTasks', {
  name: 'queue_failed_tasks',
  type: 'counter',
  title: 'Counter for failed tasks',
  description: 'Counter for failed tasks',
  labels: {
    ...commonLabels,
    reasonResolved: 'Reason for task failure',
  },
  registers: ['default'],
});

MonitorManager.registerMetric('exceptionTasks', {
  name: 'queue_exception_tasks',
  type: 'counter',
  title: 'Counter for task exception',
  description: 'Counter for task exception',
  labels: {
    ...commonLabels,
    reasonResolved: 'Reason for task exception',
  },
  registers: ['default', 'resolvers'],
});

MonitorManager.registerMetric('pendingTasks', {
  name: 'queue_pending_tasks',
  type: 'gauge',
  title: 'Total number of pending tasks',
  description: 'Total number of pending tasks',
  labels: commonLabels,
  registers: ['totals'],
});

MonitorManager.registerMetric('claimedTasks', {
  name: 'queue_claimed_tasks',
  type: 'gauge',
  title: 'Total number of claimed tasks',
  description: 'Total number of claimed tasks',
  labels: commonLabels,
  registers: ['totals'],
});

MonitorManager.registerMetric('workersTotal', {
  name: 'queue_workers_total',
  type: 'gauge',
  title: 'Total number of workers',
  description: 'Total number of workers',
  labels: commonLabels,
  registers: ['totals'],
});

MonitorManager.registerMetric('quarantinedWorkers', {
  name: 'queue_quarantined_workers',
  type: 'gauge',
  title: 'Total number of quarantined workers',
  description: 'Total number of quarantined workers',
  labels: commonLabels,
  registers: ['totals'],
});

MonitorManager.registerMetric('runningWorkers', {
  name: 'queue_running_workers',
  type: 'gauge',
  title: 'Total number of workers in running state',
  description: 'Total number of workers in running state',
  labels: commonLabels,
  registers: ['totals'],
});

MonitorManager.registerMetric('idleWorkers', {
  name: 'queue_idle_workers',
  type: 'gauge',
  title: 'Total number of idle workers',
  description: 'Total number of idle workers (not quarantined, not running)',
  labels: commonLabels,
  registers: ['totals'],
});
