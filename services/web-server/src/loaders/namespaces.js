import ConnectionLoader from '../ConnectionLoader.js';
import sift from '../utils/sift.js';

export default ({ index }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const namespaces = new ConnectionLoader(async ({ namespace, options, filter }) => {
    const raw = await index.listNamespaces(namespace, options);

    return {
      ...raw,
      items: sift(filter, raw.namespaces),
    };
  });
  const taskNamespace = new ConnectionLoader(async ({ namespace, options, filter }) => {
    const raw = await index.listTasks(namespace, options);

    return {
      ...raw,
      items: sift(filter, raw.tasks),
    };
  });

  return {
    namespaces,
    taskNamespace,
  };
};
