import DataLoader from 'dataloader';
import ConnectionLoader from '../ConnectionLoader.js';
import sift from '../utils/sift.js';

export default ({ queue }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const workerType = new DataLoader((queries) =>
    Promise.all(
      queries.map(async ({ provisionerId, workerType }) => {
        try {
          return await queue.getWorkerType(provisionerId, workerType);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const workerTypes = new ConnectionLoader(async ({ provisionerId, options, filter }) => {
    const raw = await queue.listWorkerTypes(provisionerId, options);
    const workerTypes = sift(filter, raw.workerTypes);
    return { ...raw, items: workerTypes };
  });
  const pendingTasks = new DataLoader((queries) =>
    Promise.all(
      queries.map(async ({ provisionerId, workerType }) => {
        try {
          const { pendingTasks } = await queue.pendingTasks(`${provisionerId}/${workerType}`);

          return pendingTasks;
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    workerType,
    workerTypes,
    pendingTasks,
  };
};
