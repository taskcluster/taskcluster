import TaskStatus from '../entities/TaskStatus';

export const typeDefs = `
  type TaskMetadata {
    name: String!
    description: String!
    owner: String!
    source: String!
  }
  
  input TaskMetadataInput {
    name: String!
    description: String!
    owner: String!
    source: String!
  }
  
  enum TaskPriority {
    HIGHEST
    VERY_HIGH
    HIGH
    MEDIUM
    LOW
    VERY_LOW
    LOWEST
  }
  
  enum TaskRequire {
    ALL_COMPLETED
    ALL_RESOLVED
  }
  
  type Task {
    taskId: String!
    provisionerId: String!
    workerType: String!
    schedulerId: String!
    taskGroupId: String!
    dependencies: [String]!
    requires: TaskRequire!
    routes: [String]!
    priority: TaskPriority!
    retries: Int!
    created: DateTime!
    deadline: DateTime!
    expires: DateTime
    scopes: [String]!
    payload: JSON!
    metadata: TaskMetadata!
    tags: JSON!
    extra: JSON!
  }
  
  input TaskInput {
    provisionerId: String!
    workerType: String!
    schedulerId: String
    taskGroupId: String
    dependencies: [String]
    requires: TaskRequire
    routes: [String]
    priority: TaskPriority
    retries: Int
    created: DateTime!
    deadline: DateTime!
    expires: DateTime
    scopes: [String]
    payload: JSON!
    metadata: TaskMetadataInput!
    tags: JSON
    extra: JSON
  }

  extend type Query {
    task(taskId: String!): Task
  }
  
  extend type Mutation {
    createTask(taskId: String!, task: TaskInput!): TaskStatus
  }
`;

export const resolvers = {
  TaskPriority: {
    HIGHEST: 'highest',
    VERY_HIGH: 'very-high',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    VERY_LOW: 'very-low',
    LOWEST: 'lowest',
  },
  TaskRequire: {
    ALL_COMPLETED: 'all-completed',
    ALL_RESOLVED: 'all-resolved',
  },
  Query: {
    task(parent, { taskId }, { loaders }) {
      return loaders.task.load(taskId);
    },
  },
  Mutation: {
    async createTask(parent, { taskId, task }, { clients }) {
      const { status } = await clients.queue.createTask(taskId, task);

      return new TaskStatus(taskId, status);
    },
  },
};
