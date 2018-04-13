export default {
  LatestTask: {
    async run(parent, args, { loaders }) {
      const status = await loaders.status.load(parent.taskId);

      return status.runs[parent.runId];
    },
  },
  Worker: {
    latestTasks(parent, args, { loaders }) {
      return loaders.task.loadMany(
        parent.recentTasks.map(({ taskId }) => taskId)
      );
    },
  },
  Query: {
    worker(
      parent,
      { provisionerId, workerType, workerGroup, workerId },
      { loaders }
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
      { provisionerId, workerType, connection, filter },
      { loaders }
    ) {
      return loaders.workers.load({
        provisionerId,
        workerType,
        connection,
        filter,
      });
    },
  },
  Mutation: {
    quarantineWorker(
      parent,
      { provisionerId, workerType, workerGroup, workerId, payload },
      { clients }
    ) {
      return clients.queue.quarantineWorker(
        provisionerId,
        workerType,
        workerGroup,
        workerId,
        payload
      );
    },
  },
};
