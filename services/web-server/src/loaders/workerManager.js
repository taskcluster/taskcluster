import DataLoader from 'dataloader';

export default ({ workerManager }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const WorkerPool = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId }) => {
        return await workerManager.workerPool(workerPoolId);
      })
    )
  );

  const WorkerManagerWorker = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId, workerGroup, workerId }) => {
        return await workerManager.worker(workerPoolId, workerGroup, workerId);
      })
    )
  );

  return {
    WorkerPool,
    WorkerManagerWorker,
  };
};
