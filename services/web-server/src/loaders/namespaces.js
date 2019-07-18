const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ index }) => {
  const namespaces = new ConnectionLoader(
    async ({ namespace, options, filter }) => {
      const raw = await index.listNamespaces(namespace, options);

      return {
        ...raw,
        items: siftUtil(filter, raw.namespaces),
      };
    }
  );
  const taskNamespace = new ConnectionLoader(
    async ({ namespace, options, filter }) => {
      const raw = await index.listTasks(namespace, options);

      return {
        ...raw,
        items: siftUtil(filter, raw.tasks),
      };
    }
  );

  return {
    namespaces,
    taskNamespace,
  };
};
