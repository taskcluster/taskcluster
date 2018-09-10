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
  TaskSubscription: {
    // eslint-disable-next-line consistent-return
    __resolveType(obj) {
      // eslint-disable-next-line default-case
      switch (obj.status.state) {
        case 'unscheduled':
          return 'TaskDefined';
        case 'pending':
          return 'TaskPending';
        case 'running':
          return 'TaskRunning';
        case 'completed':
          return 'TaskCompleted';
        case 'failed':
          return 'TaskFailed';
        case 'exception':
          return 'TaskException';
      }
    },
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
    tasksDefined: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskDefined(routingKey);

        return pulseEngine.asyncIterator('tasksDefined', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksPending: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskPending(routingKey);

        return pulseEngine.asyncIterator('tasksPending', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksRunning: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskRunning(routingKey);

        return pulseEngine.asyncIterator('tasksRunning', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksCompleted: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskCompleted(routingKey);

        return pulseEngine.asyncIterator('tasksCompleted', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksFailed: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskFailed(routingKey);

        return pulseEngine.asyncIterator('tasksFailed', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksException: {
      subscribe(parent, { taskGroupId }, { pulseEngine, clients }) {
        const routingKey = { taskGroupId };
        const binding = clients.queueEvents.taskException(routingKey);

        return pulseEngine.asyncIterator('tasksException', {
          [binding.routingKeyPattern]: [binding.exchange],
        });
      },
    },
    tasksSubscriptions: {
      subscribe(
        parent,
        { taskGroupId, subscriptions },
        { pulseEngine, clients }
      ) {
        const routingKey = { taskGroupId };
        const triggers = subscriptions.reduce((triggers, eventName) => {
          const method = eventName.replace('tasks', 'task');
          const binding = clients.queueEvents[method](routingKey);

          return {
            ...triggers,
            [binding.routingKeyPattern]: [
              ...(triggers[binding.routingKeyPattern] || []),
              binding.exchange,
            ],
          };
        }, {});

        return pulseEngine.asyncIterator('tasksSubscriptions', triggers);
      },
    },
  },
};
