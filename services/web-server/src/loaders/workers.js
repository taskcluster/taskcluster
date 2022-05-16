const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');
const WorkerCompact = require('../entities/WorkerCompact');

module.exports = ({ workerManager }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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
      isRequested,
      isRunning,
      isStopping,
      isStopped,
    }) => {
      let opts = { ...options };
      if (typeof isQuarantined === 'boolean') {
        opts.isQuarantined = isQuarantined;
      }
      if (typeof isRequested === 'boolean') {
        opts.isRequested = isRequested;
      }
      if (typeof isRunning === 'boolean') {
        opts.isRunning = isRunning;
      }
      if (typeof isStopping === 'boolean') {
        opts.isStopping = isStopping;
      }
      if (typeof isStopped === 'boolean') {
        opts.isStopped = isStopped;
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
