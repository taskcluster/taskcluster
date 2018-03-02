export default {
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
