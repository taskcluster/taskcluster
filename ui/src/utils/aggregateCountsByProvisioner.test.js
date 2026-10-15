import aggregateCountsByProvisioner from './aggregateCountsByProvisioner';

describe('aggregateCountsByProvisioner', () => {
  it('sums counts and counts worker types per provisioner', () => {
    expect(
      aggregateCountsByProvisioner([
        { taskQueueId: 'p1/a', pendingTasks: 1, claimedTasks: 2 },
        { taskQueueId: 'p1/b', pendingTasks: 3, claimedTasks: 4 },
        { taskQueueId: 'p2/c', pendingTasks: 0, claimedTasks: 0 },
      ])
    ).toEqual({
      p1: { pendingTasks: 4, claimedTasks: 6, workerTypeCount: 2 },
      p2: { pendingTasks: 0, claimedTasks: 0, workerTypeCount: 1 },
    });
  });

  it('makes a total null when any count is null', () => {
    expect(
      aggregateCountsByProvisioner([
        { taskQueueId: 'p1/a', pendingTasks: null, claimedTasks: 2 },
        { taskQueueId: 'p1/b', pendingTasks: 3, claimedTasks: 4 },
      ])
    ).toEqual({
      p1: { pendingTasks: null, claimedTasks: 6, workerTypeCount: 2 },
    });
  });
});
