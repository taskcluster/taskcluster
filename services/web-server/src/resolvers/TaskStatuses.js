const siftUtil = require('../utils/siftUtil');

module.exports = {
  TaskState: {
    UNSCHEDULED: 'unscheduled',
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
  },
  TaskStatus: {
    task(parent, args, { loaders }) {
      return loaders.task.load(parent.taskId);
    },
    runs(parent, args) {
      return siftUtil(args.filter, parent.runs);
    },
  },
  Query: {
    status(parent, { taskId }, { loaders }) {
      return loaders.status.load(taskId);
    },
  },
};
