export default {
  Query: {
    cachePurges(_parent, { connection }, { loaders }) {
      return loaders.cachePurges.load({ connection });
    },
  },
  Mutation: {
    async purgeCache(_parent, { provisionerId, workerType, payload }, { clients }) {
      await clients.purgeCache.purgeCache(`${provisionerId}/${workerType}`, payload);

      return { provisionerId, workerType };
    },
  },
};
