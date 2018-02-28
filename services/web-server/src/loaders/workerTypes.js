import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ queue }) => {
  const workerType = new DataLoader(queries =>
    Promise.all(
      queries.map(({ provisionerId, workerType }) =>
        queue.getWorkerType(provisionerId, workerType)
      )
    )
  );
  const workerTypes = new ConnectionLoader(
    async ({ provisionerId, options, filter }) => {
      const raw = await queue.listWorkerTypes(provisionerId, options);
      const workerTypes = filter
        ? sift(filter, raw.workerTypes)
        : raw.workerTypes;

      return { ...raw, items: workerTypes };
    }
  );
  const pendingTasks = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ provisionerId, workerType }) => {
        const { pendingTasks } = await queue.pendingTasks(
          provisionerId,
          workerType
        );

        return pendingTasks;
      })
    )
  );

  return {
    workerType,
    workerTypes,
    pendingTasks,
  };
};
