import ConnectionLoader from '../ConnectionLoader.js';

export default ({ index }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const namespaces = new ConnectionLoader(
    async ({ namespace, options }) => {
      const raw = await index.listNamespaces(namespace, options);

      return {
        ...raw,
        items: raw.namespaces,
      };
    },
  );
  const taskNamespace = new ConnectionLoader(
    async ({ namespace, options }) => {
      const raw = await index.listTasks(namespace, options);

      return {
        ...raw,
        items: raw.tasks,
      };
    },
  );

  return {
    namespaces,
    taskNamespace,
  };
};
