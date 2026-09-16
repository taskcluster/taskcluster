const TASK_QUEUE_COUNTS_BATCH_SIZE = 1000;

/**
 * Fetch pending and claimed task counts for every requested task queue.
 *
 * The Queue endpoint accepts at most 1,000 task queue IDs per request, so
 * larger collections are split into sequential requests.
 */
export default async function fetchTaskQueueCounts(queue, taskQueueIds) {
  const counts = [];
  const uniqueTaskQueueIds = [...new Set(taskQueueIds)];

  for (
    let start = 0;
    start < uniqueTaskQueueIds.length;
    start += TASK_QUEUE_COUNTS_BATCH_SIZE
  ) {
    const { taskQueueCounts } = await queue.taskQueueCountsBatch({
      taskQueueIds: uniqueTaskQueueIds.slice(
        start,
        start + TASK_QUEUE_COUNTS_BATCH_SIZE
      ),
    });

    counts.push(...taskQueueCounts);
  }

  return counts;
}
