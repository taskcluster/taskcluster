export default {
  RunState: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
  },
  RunReasonCreated: {
    SCHEDULED: 'scheduled',
    RETRY: 'retry',
    TASK_RETRY: 'task-retry',
    RERUN: 'rerun',
    EXCEPTION: 'exception',
  },
  RunReasonResolved: {
    COMPLETED: 'completed',
    FAILED: 'failed',
    DEADLINE_EXCEEDED: 'deadline-exceeded',
    CANCELED: 'canceled',
    SUPERSEDED: 'superseded',
    CLAIM_EXPIRED: 'claim-expired',
    WORKER_SHUTDOWN: 'worker-shutdown',
    MALFORMED_PAYLOAD: 'malformed-payload',
    RESOURCE_UNAVAILABLE: 'resource-unavailable',
    INTERNAL_ERROR: 'internal-error',
    INTERMITTENT_TASK: 'intermittent-task',
  },
  TaskRun: {
    artifacts(parent, args, { loaders }) {
      return loaders.artifacts.load({
        taskId: parent.taskId,
        runId: parent.runId,
        filter: args.filter,
      });
    },
  },
};
