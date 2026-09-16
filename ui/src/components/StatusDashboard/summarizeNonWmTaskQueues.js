import format from './format';

const HINT =
  'Task queues with no worker-manager pool. Their workers talk only to the ' +
  'Queue, so worker-manager stats do not cover these tasks.';

// `data` is the list from `fetchNonWmTaskQueueCounts`, one entry per task
// queue with no worker-manager pool.
export default nonWmTaskQueues => {
  const { data, loading, error } = nonWmTaskQueues;
  let pendingTasks = 0;
  let claimedTasks = 0;
  // A missing count would make the total misleadingly low; show "n/a".
  let taskCountsAvailable = Boolean(data);

  if (!error && !loading) {
    (data || []).forEach(taskQueue => {
      if (!taskQueue) {
        return;
      }

      if (taskQueue.pendingTasks === null || taskQueue.claimedTasks === null) {
        taskCountsAvailable = false;
      }

      pendingTasks += taskQueue.pendingTasks || 0;
      claimedTasks += taskQueue.claimedTasks || 0;
    });
  }

  const link = '/provisioners';
  const formatTaskCount = count => {
    if (loading) {
      return '...';
    }

    return taskCountsAvailable ? format(count) : 'n/a';
  };

  return [
    {
      title: 'Pending Tasks',
      hint: HINT,
      value: formatTaskCount(pendingTasks),
      link,
      error: error?.message,
      loading,
      altColor: true,
    },
    {
      title: 'Claimed Tasks',
      hint: HINT,
      value: formatTaskCount(claimedTasks),
      link,
      error: error?.message,
      loading,
      altColor: true,
    },
  ];
};
