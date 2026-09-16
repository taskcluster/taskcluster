import { fetchWorkerPools } from './StatsFetcher';

describe('fetchWorkerPools', () => {
  it('keeps worker pool stats when task queue counts fail', async () => {
    const workerManager = {
      listWorkerPools: vi.fn().mockResolvedValue({
        workerPools: [
          {
            workerPoolId: 'provisioner/worker',
            providerId: 'provider',
          },
        ],
      }),
      listWorkerPoolsStats: vi.fn().mockResolvedValue({
        workerPoolsStats: [
          {
            workerPoolId: 'provisioner/worker',
            currentCapacity: 3,
            runningCount: 2,
          },
        ],
      }),
    };
    const queue = {
      taskQueueCountsBatch: vi
        .fn()
        .mockRejectedValue(new Error('InsufficientScopes')),
    };

    await expect(fetchWorkerPools(workerManager, queue)).resolves.toEqual([
      {
        workerPoolId: 'provisioner/worker',
        providerId: 'provider',
        currentCapacity: 3,
        runningCount: 2,
        pendingTasks: null,
        claimedTasks: null,
      },
    ]);
  });
});
