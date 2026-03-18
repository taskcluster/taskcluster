import TaskStatus from '../entities/TaskStatus.js';

export default {
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
    status(parent, _args, { loaders }) {
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
    async decisionTask(parent, _args, { loaders }) {
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
  DependentTask: {
    async status(parent, _args, { loaders }) {
      // parent.status might be null if dependentTasks already determined that
      // this task does not exist, in which case skip the status load
      if ('status' in parent) {
        return parent.status;
      }

      try {
        return await loaders.status.load(parent.taskId);
      } catch (e) {
        if (e.code === 'ResourceNotFound') {
          return null;
        }
        return e;
      }
    },
  },
  Query: {
    task(_parent, { taskId }, { loaders }) {
      return loaders.task.load(taskId);
    },
    tasks(_parent, { taskIds }, { loaders }) {
      return Promise.all(
        taskIds.map(async (taskId) => {
          try {
            return await loaders.task.load(taskId);
          } catch (e) {
            return e;
          }
        }),
      );
    },
    async dependentTasks(_parent, args, { loaders }) {
      const task = await loaders.task.load(args.taskId);

      return Promise.all(
        task.dependencies.map(async (dependency) => {
          // generate a DependentTask object from the task loader's result
          try {
            return await loaders.task.load(dependency);
          } catch (e) {
            // if the depended-on task does not exist (such as because it has expired),
            // then return a valid DependentTask with only the taskId.
            if (e.code === 'ResourceNotFound') {
              return { taskId: dependency, status: null, metadata: null };
            }
            return e;
          }
        }),
      );
    },
    async dependents(_parent, { taskId, connection, filter }, { loaders }) {
      return loaders.dependents.load({ taskId, connection, filter });
    },
    indexedTask(_parent, { indexPath }, { loaders }) {
      return loaders.indexedTask.load(indexPath);
    },
    taskGroup(_parent, { taskGroupId, connection, filter }, { loaders }) {
      return loaders.taskGroup.load({ taskGroupId, connection, filter });
    },
    taskActions(_parent, { taskGroupId, filter }, { loaders }) {
      return loaders.taskActions.load({ taskGroupId, filter });
    },
    listPendingTasks(_parent, { taskQueueId, connection }, { loaders }) {
      return loaders.listPendingTasks.load({ taskQueueId, connection });
    },
    listClaimedTasks(_parent, { taskQueueId, connection }, { loaders }) {
      return loaders.listClaimedTasks.load({ taskQueueId, connection });
    },
  },
  Mutation: {
    async createTask(_parent, { taskId, task }, { clients }) {
      const { options: _, ...taskWithoutOptions } = task;
      const { status } = await clients.queue.createTask(taskId, taskWithoutOptions);

      return new TaskStatus(taskId, status);
    },
    async scheduleTask(_parent, { taskId }, { clients }) {
      const { status } = await clients.queue.scheduleTask(taskId);

      return new TaskStatus(taskId, status);
    },
    async cancelTask(_parent, { taskId }, { clients }) {
      const { status } = await clients.queue.cancelTask(taskId);

      return new TaskStatus(taskId, status);
    },
    async rerunTask(_parent, { taskId }, { clients }) {
      const { status } = await clients.queue.rerunTask(taskId);

      return new TaskStatus(taskId, status);
    },
    async sealTaskGroup(_parent, { taskGroupId }, { clients }) {
      const taskGroup = await clients.queue.sealTaskGroup(taskGroupId);
      return taskGroup;
    },
    async cancelTaskGroup(_parent, { taskGroupId }, { clients }) {
      const taskGroup = await clients.queue.cancelTaskGroup(taskGroupId);
      return taskGroup;
    },
  },
  Subscription: {
    // by taskGroupId
    tasksSubscriptions: {
      subscribe(_parent, { taskGroupId, subscriptions }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };

        return pulseEngine.eventIterator(
          'tasksSubscriptions',
          subscriptions.map((eventName) => {
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
    // by taskId
    taskSubscriptions: {
      subscribe(_parent, { taskId, subscriptions }, { pulseEngine, clients }) {
        const routingKey = { taskId };

        return pulseEngine.eventIterator(
          'taskSubscriptions',
          subscriptions.map((eventName) => {
            const method = eventName.replace('tasks', 'task');
            const binding = clients.queueEvents[method](routingKey);

            return {
              exchange: binding.exchange,
              pattern: binding.routingKeyPattern,
            };
          }),
        );
      },
      resolve: ({ taskSubscriptions }) => {
        return taskSubscriptions.status;
      },
    },
  },
};
