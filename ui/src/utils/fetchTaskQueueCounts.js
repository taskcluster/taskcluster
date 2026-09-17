// The endpoint accepts at most this many task queue ids per request.
const TASK_QUEUE_COUNTS_BATCH_SIZE = 1000;

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
