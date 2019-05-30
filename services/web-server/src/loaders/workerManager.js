const DataLoader = require('dataloader');
const sift = require('sift').default;

module.exports = ({ workerManager }) => {
  // const WorkerManagerWorkerPoolSummaries = new DataLoader(queries =>
  //   Promise.all(
  //     queries.map(async (filter) => {
  //       const summaries = await workerManager.listWorkerPools();
  //
  //       return filter ? sift(filter, summaries) : summaries;
  //     })
  //   )
  // );

  // const WMWorkers = new DataLoader(queries =>
  //   Promise.all(
  //     queries.map(async (workerPool, isQuarantined, filter) => {
  //       const workers = await workerManager.getWorkers(provisionerId, workerPool, isQuarantined);
  //
  //       return filter ? sift(filter, workers) : workers;
  //     })
  //   )
  // );

  const WorkerManagerWorkerPoolSummaries = new DataLoader(queries => {
    return Promise.all(
      queries.map(({ filter }) => {
        const summaries = [
          {
            workerPool: 'banana',
            lastActive: new Date(),
            pendingCapacity: 0,
            runningCapacity: 1,
            pendingTasks: 0,
            lastResolved: new Date(),
            failed: 0,
            exception: 1,
            unscheduled: 2,
            provider: 'aws',
          },
          {
            workerPool: 'pineapple',
            pendingCapacity: 1,
            runningCapacity: 3,
            pendingTasks: 1,
            lastActive: new Date('December 17, 1995 03:24:00'),
            lastResolved: new Date('December 17, 1995 03:24:00'),
            failed: 1,
            exception: 2,
            unscheduled: 3,
            provider: 'gcp',
          },
        ];

        return filter ? Promise.resolve(sift(filter, summaries)) : Promise.resolve(summaries);
      })
    );
  });

  const WorkerManagerWorkers = new DataLoader(queries => {
    return Promise.all(
      queries.map(({ workerPool, provider, isQuarantined, filter }) => {
        const summaries = [
          {
            workerId: 'rust-awesomness',
            workerGroup: '🦀',
            workerAge: new Date('December 17, 1995 03:24:00'),

            latestTaskRun: {
              taskId: '832bfhi23',
              runId: 0,
              state: 'failed',
              reasonCreated: 'scheduled',
              reasonResolved: 'failed',
              workerGroup: 'nyancat',
              workerId: 'jhsdfg87w3',
              takenUntil: new Date('December 17, 2000 03:24:00'),
              scheduled: new Date('December 17, 1993 03:24:00'),
              started: new Date('December 17, 1994 03:24:00'),
              resolved: new Date('December 17, 1997 03:24:00'),
              artifacts: {},
            },

            workerPool: 'banana',
            providerId: 'gcp',
            latestTaskStatus: 'great success',

            quarantineUntil: new Date('December 17, 2095 03:24:00'),
            recentErrors: 2,
            latestStarted: new Date(),
            latestResolved: new Date(),
          },
        ];

        return filter ? Promise.resolve(sift(filter, summaries)) : Promise.resolve(summaries);
      })
    );
  });

  return {
    WorkerManagerWorkerPoolSummaries,
    WorkerManagerWorkers,
  };
};
