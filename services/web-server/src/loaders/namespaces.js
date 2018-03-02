import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ index }) => {
  const namespaces = new ConnectionLoader(
    async ({ namespace, options, filter }) => {
      const raw = await index.listNamespaces(namespace, options);

      return {
        ...raw,
        items: filter ? sift(filter, raw.namespaces) : raw.namespaces,
      };
    }
  );
  const taskNamespace = new ConnectionLoader(
    async ({ namespace, options, filter }) => {
      const raw = await index.listTasks(namespace, options);

      return {
        ...raw,
        items: filter ? sift(filter, raw.tasks) : raw.tasks,
      };
    }
  );

  return {
    namespaces,
    taskNamespace,
  };
};
