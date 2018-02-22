export const typeDefs = `
  enum RunReasonCreated {
    SCHEDULED
    RETRY
    TASK_RETRY
    RERUN
    EXCEPTION
  }
  
  enum RunReasonResolved {
    COMPLETED
    FAILED
    DEADLINE_EXCEEDED
    CANCELED
    SUPERSEDED
    CLAIM_EXPIRED
    WORKER_SHUTDOWN
    MALFORMED_PAYLOAD
    RESOURCE_UNAVAILABLE
    INTERNAL_ERROR
    INTERMITTENT_TASK
  }

  enum RunState {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    EXCEPTION
  }

  type TaskRun {
    runId: Int!
    taskId: String!
    state: RunState!
    reasonCreated: RunReasonCreated!
    reasonResolved: RunReasonResolved
    workerGroup: String
    workerId: String
    takenUntil: DateTime
    scheduled: DateTime!
    started: DateTime
    resolved: DateTime
  }
`;

export const resolvers = {
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
};
