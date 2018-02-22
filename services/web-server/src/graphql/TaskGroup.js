export const typeDefs = `
  type TaskGroupTasksConnection {
    pageInfo: PageInfo!
    edges: [TaskGroupTasksEdge]
  }
  
  type TaskGroupTasksEdge {
    cursor: String
    node: Task
  }
  
  type TaskGroup {
    taskGroupId: String!
    tasks: TaskGroupTasksConnection
  }
  
  extend type Query {
    taskGroup(taskGroupId: String!, connection: PageConnection): TaskGroup
  }
`;

export const resolvers = {
  Query: {
    taskGroup: (parent, { taskGroupId, connection }, { loaders }) =>
      loaders.taskGroup.load({ taskGroupId, connection }),
  },
};
