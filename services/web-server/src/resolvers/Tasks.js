const TaskStatus = require('../entities/TaskStatus');

module.exports = {
  TaskPriority: {
    HIGHEST: 'highest',
    VERY_HIGH: 'very-high',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    VERY_LOW: 'very-low',
    LOWEST: 'lowest',
    NORMAL: 'normal',
  },
  TaskRequire: {
    ALL_COMPLETED: 'all-completed',
    ALL_RESOLVED: 'all-resolved',
  },
  TaskSubscriptions: {
    tasksDefined: 'tasksDefined',
    tasksPending: 'tasksPending',
    tasksRunning: 'tasksRunning',
    tasksCompleted: 'tasksCompleted',
    tasksFailed: 'tasksFailed',
    tasksException: 'tasksException',
  },
  Task: {
    status(parent, args, { loaders }) {
      if (parent.status) {
        return parent.status;
      }

      return loaders.status.load(parent.taskId);
    },
    taskActions(parent, { filter }, { loaders }) {
      if (parent.taskActions) {
        return parent.taskActions;
      }

      return loaders.taskActions.load({
        taskGroupId: parent.taskGroupId,
        filter,
      });
    },
    async decisionTask(parent, args, { loaders }) {
      if (parent.decisionTask) {
        return parent.decisionTask;
      }

      try {
        return await loaders.task.load(parent.taskGroupId);
      } catch (e) {
        // Do not throw an error if a task has no decision task
        if (e.statusCode === 404) {
          return null;
        }

        return e;
      }
    },
    latestArtifacts(parent, { taskId, connection, filter }, { loaders }) {
      if (parent.latestArtifacts) {
        return parent.latestArtifacts;
      }

      return loaders.latestArtifacts.load({ taskId, connection, filter });
    },
  },
  Query: {
    task(parent, { taskId }, { loaders }) {
      return loaders.task.load(taskId);
    },
    tasks(parent, { taskIds }, { loaders }) {
      return loaders.task.loadMany(taskIds);
    },
    async dependentTasks(parent, args, { loaders }) {
      const task = await loaders.task.load(args.taskId);

      return loaders.task.loadMany(task.dependencies);
    },
    indexedTask(parent, { indexPath }, { loaders }) {
      return loaders.indexedTask.load(indexPath);
    },
    taskGroup(parent, { taskGroupId, connection, filter }, { loaders }) {
      return loaders.taskGroup.load({ taskGroupId, connection, filter });
    },
    taskActions(parent, { taskGroupId, filter }, { loaders }) {
      return loaders.taskActions.load({ taskGroupId, filter });
    },
  },
  Mutation: {
    async createTask(parent, { taskId, task }, { clients }) {
      const queue = task.options
        ? clients.queue.use(task.options)
        : clients.queue;
      const { status } = await queue.createTask(taskId, task);

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
    async rerunTask(parent, { taskId }, { clients }) {
      const { status } = await clients.queue.rerunTask(taskId);

      return new TaskStatus(taskId, status);
    },
  },
  Subscription: {
    tasksSubscriptions: {
      subscribe(
        parent,
        { taskGroupId, subscriptions },
        { pulseEngine, clients },
      ) {
        const routingKey = { taskGroupId };

        return pulseEngine.eventIterator(
          'tasksSubscriptions',
          subscriptions.map(eventName => {
            const method = eventName.replace('tasks', 'task');
            const binding = clients.queueEvents[method](routingKey);

            return {
              exchange: binding.exchange,
              pattern: binding.routingKeyPattern,
            };
          }),
        );
      },
      resolve: ({ tasksSubscriptions }) => {
        return tasksSubscriptions.status;
      },
    },
  },
};
