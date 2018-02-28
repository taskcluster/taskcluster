export default {
  Query: {
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
};
