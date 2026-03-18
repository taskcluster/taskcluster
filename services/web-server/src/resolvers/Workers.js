export default {
  LatestTask: {
    async run(parent, _args, { loaders }) {
      const status = await loaders.status.load(parent.taskId);

      return status.runs[parent.runId];
    },
  },
  Worker: {
    latestTasks(parent, _args, { loaders }) {
      return Promise.all(
        parent.recentTasks.map(async ({ taskId }) => {
          try {
            return await loaders.task.load(taskId);
          } catch (e) {
            return e;
          }
        }),
      );
    },
  },
  Query: {
    worker(_parent, { provisionerId, workerType, workerGroup, workerId }, { loaders }) {
      return loaders.worker.load({
        provisionerId,
        workerType,
        workerGroup,
        workerId,
      });
    },
    workers(_parent, { provisionerId, workerType, isQuarantined, workerState, connection, filter }, { loaders }) {
      return loaders.workers.load({
        provisionerId,
        workerType,
        isQuarantined,
        workerState,
        connection,
        filter,
      });
    },
  },
  Mutation: {
    quarantineWorker(_parent, { provisionerId, workerType, workerGroup, workerId, payload }, { clients }) {
      return clients.queue.quarantineWorker(provisionerId, workerType, workerGroup, workerId, payload);
    },
  },
};
