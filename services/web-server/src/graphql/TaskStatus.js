export const typeDefs = `
  enum TaskState {
    UNSCHEDULED
    PENDING
    RUNNING
    COMPLETED
    FAILED
    EXCEPTION
  }
  
  type TaskStatus {
    taskId: String!
    provisionerId: String!
    workerType: String!
    schedulerId: String!
    taskGroupId: String!
    deadline: DateTime!
    expires: DateTime!
    retriesLeft: Int!
    state: TaskState!
    runs: [TaskRun!]!
  }
  
  extend type Query {
    status(taskId: String!): TaskStatus
  }
`;

export const resolvers = {
  TaskState: {
    UNSCHEDULED: 'unscheduled',
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
  },
  Query: {
    status: (parent, { taskId }, { loaders }) => loaders.status.load(taskId),
  },
};
