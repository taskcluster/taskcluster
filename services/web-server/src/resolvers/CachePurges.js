export default {
  Query: {
    cachePurges(parent, { connection }, { loaders }) {
      return loaders.cachePurges.load({ connection });
    },
  },
  Mutation: {
    async purgeCache(
      parent,
      { provisionerId, workerType, payload },
      { clients },
    ) {
      await clients.purgeCache.purgeCache(`${provisionerId}/${workerType}`, payload);

      return { provisionerId, workerType };
    },
  },
};
