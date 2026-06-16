export default {
  Query: {
    namespaces(_parent, { namespace, connection }, { loaders }) {
      return loaders.namespaces.load({ namespace, connection });
    },
    taskNamespace(_parent, { namespace, connection }, { loaders }) {
      return loaders.taskNamespace.load({ namespace, connection });
    },
  },
};
