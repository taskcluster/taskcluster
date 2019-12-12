module.exports = {
  LatestTask: {
    async run(parent, args, { loaders }) {
      const status = await loaders.status.load(parent.taskId);

      return status.runs[parent.runId];
    },
  },
  Worker: {
    latestTasks(parent, args, { loaders }) {
      return Promise.all(parent.recentTasks.map(async ({ taskId }) => {
        try {
          return await loaders.task.load(taskId);
        } catch (e) {
          return e;
        }
      }));
    },
  },
  Query: {
    worker(
      parent,
      { provisionerId, workerType, workerGroup, workerId },
      { loaders },
    ) {
      return loaders.worker.load({
        provisionerId,
        workerType,
        workerGroup,
        workerId,
      });
    },
    workers(
      parent,
      { provisionerId, workerType, isQuarantined, connection, filter },
      { loaders },
    ) {
      return loaders.workers.load({
        provisionerId,
        workerType,
        isQuarantined,
        connection,
        filter,
      });
    },
  },
  Mutation: {
    quarantineWorker(
      parent,
      { provisionerId, workerType, workerGroup, workerId, payload },
      { clients },
    ) {
      return clients.queue.quarantineWorker(
        provisionerId,
        workerType,
        workerGroup,
        workerId,
        payload,
      );
    },
  },
};
