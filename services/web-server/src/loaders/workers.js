import DataLoader from 'dataloader';
import sift from '../utils/sift.js';
import ConnectionLoader from '../ConnectionLoader.js';
import WorkerCompact from '../entities/WorkerCompact.js';

export default ({ workerManager }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const worker = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ provisionerId, workerType, workerGroup, workerId }) => {
        try {
          return await workerManager.getWorker(provisionerId, workerType, workerGroup, workerId);
        } catch (err) {
          return err;
        }
      },
      ),
    ),
  );
  const workers = new ConnectionLoader(
    async ({
      provisionerId,
      workerType,
      options,
      filter,
      isQuarantined,
      workerState,
    }) => {
      let opts = { ...options };
      if (typeof isQuarantined === 'boolean') {
        opts.quarantined = isQuarantined;
      }
      if (typeof workerState === 'string') {
        opts.workerState = workerState;
      }
      const raw = await workerManager.listWorkers(
        provisionerId,
        workerType,
        opts,
      );
      const workers = sift(filter, raw.workers);

      return {
        ...raw,
        items: workers.map(
          worker => new WorkerCompact(provisionerId, workerType, worker),
        ),
      };
    },
  );

  return {
    worker,
    workers,
  };
};
