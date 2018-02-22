export const typeDefs = `
  extend type Task {
    status: TaskStatus
  }
  
  extend type TaskStatus {
    task: Task
  }
`;

export const resolvers = mergeInfo => ({
  Task: {
    status: {
      fragment: 'fragment TaskFragment on Task { taskId }',
      resolve(parent, args, context, info) {
        const { taskId } = parent;

        return mergeInfo.delegate('query', 'status', { taskId }, context, info);
      },
    },
  },
  TaskStatus: {
    task: {
      fragment: 'fragment TaskStatusFragment on TaskStatus { taskId }',
      resolve(parent, args, context, info) {
        const { taskId } = parent;

        return mergeInfo.delegate('query', 'task', { taskId }, context, info);
      },
    },
  },
});
