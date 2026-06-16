export default {
  TaskState: {
    UNSCHEDULED: 'unscheduled',
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
  },
  TaskStatus: {
    task(parent, _args, { loaders }) {
      return loaders.task.load(parent.taskId);
    },
    runs(parent, _args) {
      return parent.runs;
    },
  },
  Query: {
    status(_parent, { taskId }, { loaders }) {
      return loaders.status.load(taskId);
    },
  },
};
