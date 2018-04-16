import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';
import WorkerCompact from '../entities/WorkerCompact';

export default ({ queue }) => {
  const worker = new DataLoader(queries =>
    Promise.all(
      queries.map(
        async ({ provisionerId, workerType, workerGroup, workerId }) =>
          queue.getWorker(provisionerId, workerType, workerGroup, workerId)
      )
    )
  );
  const workers = new ConnectionLoader(
    async ({ provisionerId, workerType, options, filter, isQuarantined }) => {
      const raw = await queue.listWorkers(
        provisionerId,
        workerType,
        typeof isQuarantined === 'boolean'
          ? { ...options, quarantined: isQuarantined }
          : options
      );
      const workers = filter ? sift(filter, raw.workers) : raw.workers;

      return {
        ...raw,
        items: workers.map(
          worker => new WorkerCompact(provisionerId, workerType, worker)
        ),
      };
    }
  );

  return {
    worker,
    workers,
  };
};
