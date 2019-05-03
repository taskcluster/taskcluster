const DataLoader = require('dataloader');
const sift = require('sift').default;

module.exports = ({ workerManager }) => {
  // const WorkerManagerWorkerTypeSummaries = new DataLoader(queries =>
  //   Promise.all(
  //     queries.map(async (filter) => {
  //       const summaries = await workerManager.listWorkerTypes();
  //
  //       return filter ? sift(filter, summaries) : summaries;
  //     })
  //   )
  // );

  const WorkerManagerWorkerTypeSummaries = new DataLoader(queries => {
    return Promise.all(
      queries.map(({ filter }) => {
        const summaries = [
          {
            workerType: 'banana',
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
            workerType: 'pineapple',
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

  return {
    WorkerManagerWorkerTypeSummaries,
  };
};
