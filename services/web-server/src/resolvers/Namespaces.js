export default {
  Query: {
    namespaces(parent, { namespace, connection }, { loaders }) {
      return loaders.namespaces.load({ namespace, connection });
    },
    taskNamespace(parent, { namespace, connection }, { loaders }) {
      return loaders.taskNamespace.load({ namespace, connection });
    },
  },
};
