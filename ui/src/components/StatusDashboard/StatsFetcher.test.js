import { fetchNonWmTaskQueueCounts, fetchWorkerPools } from './StatsFetcher';

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
    const error = new Error('InsufficientScopes');
    const queue = {
      listTaskQueues: vi.fn().mockRejectedValue(error),
      taskQueueCountsBatch: vi.fn().mockRejectedValue(error),
    };

    await expect(fetchWorkerPools(workerManager, queue)).resolves.toEqual({
      workerPools: [
        {
          workerPoolId: 'provisioner/worker',
          providerId: 'provider',
          currentCapacity: 3,
          runningCount: 2,
          pendingTasks: null,
          claimedTasks: null,
        },
      ],
      nonWmTaskQueues: null,
      nonWmTaskQueuesError: error,
    });
  });
});

describe('fetchNonWmTaskQueueCounts', () => {
  it('counts only task queues without a worker pool', async () => {
    const queue = {
      listTaskQueues: vi.fn().mockResolvedValue({
        taskQueues: [
          { taskQueueId: 'provisioner/worker' },
          { taskQueueId: 'hardware/worker' },
          { taskQueueId: 'hardware/other' },
        ],
      }),
      taskQueueCountsBatch: vi.fn().mockResolvedValue({
        taskQueueCounts: [
          { taskQueueId: 'hardware/worker', pendingTasks: 4, claimedTasks: 1 },
        ],
      }),
    };

    await expect(
      fetchNonWmTaskQueueCounts(queue, new Set(['provisioner/worker']))
    ).resolves.toEqual([
      { taskQueueId: 'hardware/worker', pendingTasks: 4, claimedTasks: 1 },
      { taskQueueId: 'hardware/other', pendingTasks: null, claimedTasks: null },
    ]);
    expect(queue.taskQueueCountsBatch).toHaveBeenCalledWith({
      taskQueueIds: ['hardware/worker', 'hardware/other'],
    });
  });
});
