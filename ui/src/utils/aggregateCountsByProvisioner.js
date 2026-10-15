import splitTaskQueueId from './splitTaskQueueId';

const add = (total, count) =>
  total === null || count == null ? null : total + count;

// Groups per-task-queue counts by provisioner. A null count makes that
// provisioner's total null: a partial sum would be misleadingly low.
export default taskQueues => {
  const byProvisioner = {};

  taskQueues.forEach(({ taskQueueId, pendingTasks, claimedTasks }) => {
    const { provisionerId } = splitTaskQueueId(taskQueueId);
    const totals = byProvisioner[provisionerId] || {
      pendingTasks: 0,
      claimedTasks: 0,
      workerTypeCount: 0,
    };

    byProvisioner[provisionerId] = totals;
    totals.workerTypeCount += 1;

    totals.pendingTasks = add(totals.pendingTasks, pendingTasks);
    totals.claimedTasks = add(totals.claimedTasks, claimedTasks);
  });

  return byProvisioner;
};
