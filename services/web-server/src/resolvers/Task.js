import TaskStatus from '../entities/TaskStatus';

export default {
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
  Task: {
    status(parent, args, { loaders }) {
      return loaders.status.load(parent.taskId);
    },
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
