import fetchTaskQueueCounts from './fetchTaskQueueCounts';

describe('fetchTaskQueueCounts', () => {
  it('fetches pending and claimed counts in endpoint-sized batches', async () => {
    const taskQueueIds = Array.from(
      { length: 1001 },
      (_, index) => `provisioner/worker-${index}`
    );
    const queue = {
      taskQueueCountsBatch: vi.fn(async ({ taskQueueIds: batchIds }) => ({
        taskQueueCounts: batchIds.map(taskQueueId => ({
          taskQueueId,
          pendingTasks: 1,
          claimedTasks: 2,
        })),
      })),
    };

    const counts = await fetchTaskQueueCounts(queue, taskQueueIds);

    expect(queue.taskQueueCountsBatch).toHaveBeenCalledTimes(2);
    expect(queue.taskQueueCountsBatch.mock.calls[0][0].taskQueueIds).toEqual(
      taskQueueIds.slice(0, 1000)
    );
    expect(queue.taskQueueCountsBatch.mock.calls[1][0].taskQueueIds).toEqual(
      taskQueueIds.slice(1000)
    );
    expect(counts).toHaveLength(1001);
    expect(counts[1000]).toEqual({
      taskQueueId: 'provisioner/worker-1000',
      pendingTasks: 1,
      claimedTasks: 2,
    });
  });

  it('does not request counts for an empty list', async () => {
    const queue = { taskQueueCountsBatch: vi.fn() };

    await expect(fetchTaskQueueCounts(queue, [])).resolves.toEqual([]);
    expect(queue.taskQueueCountsBatch).not.toHaveBeenCalled();
  });

  it('deduplicates task queue IDs before requesting counts', async () => {
    const queue = {
      taskQueueCountsBatch: vi.fn().mockResolvedValue({ taskQueueCounts: [] }),
    };

    await fetchTaskQueueCounts(queue, [
      'provisioner/worker-a',
      'provisioner/worker-a',
      'provisioner/worker-b',
    ]);

    expect(queue.taskQueueCountsBatch).toHaveBeenCalledWith({
      taskQueueIds: ['provisioner/worker-a', 'provisioner/worker-b'],
    });
  });
});
