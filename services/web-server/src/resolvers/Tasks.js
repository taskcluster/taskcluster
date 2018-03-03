import TaskStatus from '../entities/TaskStatus';

class TasksSubscription {
  constructor(eventName) {
    this.eventName = eventName;
  }

  subscribe(parent, { taskGroupId }, { clients }) {
    return clients.pulseSubscription.asyncIterator(
      clients.queueEvents[this.eventName]({ taskGroupId }),
      this.eventName
    );
  }
}

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
    status({ taskId }, args, { loaders }) {
      return loaders.status.load(taskId);
    },
  },
  Query: {
    task(parent, { taskId }, { loaders }) {
      return loaders.task.load(taskId);
    },
    indexedTask(parent, { indexPath }, { loaders }) {
      return loaders.indexedTask.load(indexPath);
    },
    tasks(parent, { taskGroupId, connection }, { loaders }) {
      return loaders.tasks.load({ taskGroupId, connection });
    },
  },
  Mutation: {
    async createTask(parent, { taskId, task }, { clients }) {
      const { status } = await clients.queue.createTask(taskId, task);

      return new TaskStatus(taskId, status);
    },
    async scheduleTask(parent, { taskId }, { clients }) {
      const { status } = await clients.queue.scheduleTask(taskId);

      return new TaskStatus(taskId, status);
    },
    async cancelTask(parent, { taskId }, { clients }) {
      const { status } = await clients.queue.cancelTask(taskId);

      return new TaskStatus(taskId, status);
    },
  },
  Subscription: {
    tasksDefined: new TasksSubscription('tasksDefined'),
    tasksPending: new TasksSubscription('tasksPending'),
    tasksRunning: new TasksSubscription('tasksRunning'),
    tasksCompleted: new TasksSubscription('tasksCompleted'),
    tasksFailed: new TasksSubscription('tasksFailed'),
    tasksException: new TasksSubscription('tasksException'),
  },
};
