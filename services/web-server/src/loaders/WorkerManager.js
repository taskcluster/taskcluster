import DataLoader from 'dataloader';
import sift from 'sift';

export default ({ workerManager }) => {
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
            name: 'banana',
            pendingCapacity: 0,
            runningCapacity: 1,
            pendingTasks: 0,
            lastActive: new Date(),
            lastResolved: new Date(),
            failedNumber: 0,
            exceptionNumber: 1,
            unscheduledNumber: 2,
            provider: 'aws',
          },
          {
            name: 'pineapple',
            pendingCapacity: 1,
            runningCapacity: 3,
            pendingTasks: 1,
            lastActive: new Date('December 17, 1995 03:24:00'),
            lastResolved: new Date('December 17, 1995 03:24:00'),
            failedNumber: 1,
            exceptionNumber: 2,
            unscheduledNumber: 3,
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
