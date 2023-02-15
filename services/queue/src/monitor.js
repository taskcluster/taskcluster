const { MonitorManager } = require('taskcluster-lib-monitor');

/**
 * For ease of debugging, all log messages about tasks have a top-level
 * `taskId` field.  In cases where multiple tasks are handled together, prefer
 * to make individual log entries for each task.
 */

MonitorManager.register({
  name: 'azureQueuePoll',
  title: 'Azure Queue Poll',
  type: 'azure-queue-poll',
  version: 1,
  level: 'info',
  description: 'Report result of polling messages from an azure queue.',
  fields: {
    messages: 'Number of messages fetched.',
    failed: 'Number of these messages that failed to be handled.',
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
