export default {
  Query: {
    cachePurges(parent, { connection, filter }, { loaders }) {
      return loaders.cachePurges.load({ connection, filter });
    },
  },
  Mutation: {
    async purgeCache(
      parent,
      { provisionerId, workerType, payload },
      { clients }
    ) {
      await clients.purgeCache.purgeCache(provisionerId, workerType, payload);

      return { provisionerId, workerType };
    },
  },
};
