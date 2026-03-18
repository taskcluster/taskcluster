export default {
  Query: {
    namespaces(_parent, { namespace, connection, filter }, { loaders }) {
      return loaders.namespaces.load({ namespace, connection, filter });
    },
    taskNamespace(_parent, { namespace, connection, filter }, { loaders }) {
      return loaders.taskNamespace.load({ namespace, connection, filter });
    },
  },
};
