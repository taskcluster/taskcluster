export default {
  Query: {
    namespaces(parent, { namespace, connection, filter }, { loaders }) {
      return loaders.namespaces.load({ namespace, connection, filter });
    },
    taskNamespace(parent, { namespace, connection, filter }, { loaders }) {
      return loaders.taskNamespace.load({ namespace, connection, filter });
    },
  },
};
